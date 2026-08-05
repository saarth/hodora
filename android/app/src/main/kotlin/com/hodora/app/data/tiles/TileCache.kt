package com.hodora.app.data.tiles

import android.content.Context
import java.io.File

/** Shared on-disk layout for cached tiles, used by both the downloader and the loopback server. */
object TileCache {
    fun file(context: Context, coord: TileCoord): File {
        val themeDir = coord.theme.name.lowercase()
        val dir = File(context.filesDir, "tiles/$themeDir/${coord.z}/${coord.x}")
        return File(dir, "${coord.y}.png")
    }

    fun file(context: Context, theme: MapTheme, z: Int, x: Int, y: Int): File =
        file(context, TileCoord(theme, z, x, y))
}
