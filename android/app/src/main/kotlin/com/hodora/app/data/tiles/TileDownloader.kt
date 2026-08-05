package com.hodora.app.data.tiles

import android.content.Context
import com.hodora.app.data.model.RidePoint
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Per-route offline tile prefetch — port of downloadRouteTiles/estimateTileCount/
 * isRouteMapSaved/removeRouteTiles in src/lib/offline-tiles.ts. Downloads land
 * in the same on-disk cache TileCacheServer reads from, so once this finishes
 * the map keeps working with no network at all.
 */
@Singleton
class TileDownloader @Inject constructor(
    @ApplicationContext private val context: Context,
    private val okHttpClient: OkHttpClient,
) {
    private val concurrency = 8

    suspend fun downloadRouteTiles(points: List<RidePoint>, onProgress: (downloaded: Int, total: Int) -> Unit) {
        val tiles = TileUrls.tilesForRoute(points).take(TileUrls.MAX_TILES)
        val total = tiles.size
        if (total == 0) {
            onProgress(0, 0)
            return
        }

        var downloaded = 0
        val semaphore = Semaphore(concurrency)

        coroutineScope {
            tiles.map { coord ->
                async(Dispatchers.IO) {
                    semaphore.withPermit {
                        currentCoroutineContext().ensureActive()
                        downloadOne(coord)
                    }
                    downloaded++
                    if (downloaded % 10 == 0 || downloaded == total) onProgress(downloaded, total)
                }
            }.awaitAll()
        }
    }

    private fun downloadOne(coord: TileCoord) {
        val file = TileCache.file(context, coord)
        if (file.exists()) return
        try {
            val request = Request.Builder().url(TileUrls.remoteUrl(coord.theme, coord.z, coord.x, coord.y)).build()
            okHttpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return
                val bytes = response.body?.bytes() ?: return
                file.parentFile?.mkdirs()
                file.writeBytes(bytes)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            // best-effort — a missed tile just means a blank spot on the offline map
        }
    }

    /** Rough size estimate shown in the UI before downloading, ~22 KB/tile (matches offline-tiles.ts). */
    fun estimateTileCount(points: List<RidePoint>): Int =
        TileUrls.tilesForRoute(points).size.coerceAtMost(TileUrls.MAX_TILES)

    fun estimateSizeMb(points: List<RidePoint>): Double = estimateTileCount(points) * 22.0 / 1024.0

    /** Heuristic (not exhaustive): checks whether a handful of sample tiles are cached. */
    suspend fun isRouteMapSaved(points: List<RidePoint>): Boolean = withContext(Dispatchers.IO) {
        val tiles = TileUrls.tilesForRoute(points).toList()
        if (tiles.isEmpty()) return@withContext false
        val samples = listOfNotNull(
            tiles.firstOrNull(),
            tiles.getOrNull(tiles.size / 2),
            tiles.lastOrNull(),
        )
        samples.all { TileCache.file(context, it).exists() }
    }

    suspend fun removeRouteTiles(points: List<RidePoint>) = withContext(Dispatchers.IO) {
        TileUrls.tilesForRoute(points).forEach { coord ->
            TileCache.file(context, coord).delete()
        }
    }
}
