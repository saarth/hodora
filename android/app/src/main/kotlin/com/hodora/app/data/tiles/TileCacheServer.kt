package com.hodora.app.data.tiles

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Loopback HTTP proxy the map's raster tile source always points at, whether
 * online or offline — mirrors the web app's service-worker cache-first
 * strategy (src/lib/offline-tiles.ts / the "map-tiles" Cache Storage bucket):
 * serve from disk if cached, else fetch from CARTO and populate the cache.
 */
@Singleton
class TileCacheServer @Inject constructor(
    @ApplicationContext private val context: Context,
    private val okHttpClient: OkHttpClient,
) : NanoHTTPD("127.0.0.1", 0) {

    private var started = false

    @Synchronized
    fun ensureStarted() {
        if (started) return
        start(SOCKET_READ_TIMEOUT, false)
        started = true
    }

    /** `{z}`/`{x}`/`{y}` placeholders — MapLibre substitutes these into the raster tile URL template. */
    fun tileUrlTemplate(theme: MapTheme): String {
        ensureStarted()
        val themePath = theme.name.lowercase()
        return "http://127.0.0.1:$listeningPort/tile/$themePath/{z}/{x}/{y}.png"
    }

    override fun serve(session: IHTTPSession): Response {
        val parts = session.uri.trim('/').split('/')
        // expects: tile/<theme>/<z>/<x>/<y>.png
        if (parts.size != 5 || parts[0] != "tile") {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "not found")
        }
        val theme = when (parts[1]) {
            "light" -> MapTheme.LIGHT
            "dark" -> MapTheme.DARK
            else -> return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "unknown theme")
        }
        val z = parts[2].toIntOrNull()
        val x = parts[3].toIntOrNull()
        val y = parts[4].removeSuffix(".png").toIntOrNull()
        if (z == null || x == null || y == null) {
            return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "bad tile coords")
        }

        val cached = TileCache.file(context, theme, z, x, y)
        val bytes = if (cached.exists()) {
            cached.readBytes()
        } else {
            fetchAndCache(theme, z, x, y, cached)
        }

        return if (bytes != null) {
            newFixedLengthResponse(Response.Status.OK, "image/png", ByteArrayInputStream(bytes), bytes.size.toLong())
        } else {
            newFixedLengthResponse(Response.Status.NO_CONTENT, "image/png", ByteArrayInputStream(ByteArray(0)), 0)
        }
    }

    private fun fetchAndCache(theme: MapTheme, z: Int, x: Int, y: Int, cacheFile: java.io.File): ByteArray? = runBlocking {
        try {
            val request = Request.Builder().url(TileUrls.remoteUrl(theme, z, x, y)).build()
            okHttpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@runBlocking null
                val bytes = response.body?.bytes() ?: return@runBlocking null
                cacheFile.parentFile?.mkdirs()
                cacheFile.writeBytes(bytes)
                bytes
            }
        } catch (e: Exception) {
            null
        }
    }

    companion object {
        private const val SOCKET_READ_TIMEOUT = 15_000
    }
}
