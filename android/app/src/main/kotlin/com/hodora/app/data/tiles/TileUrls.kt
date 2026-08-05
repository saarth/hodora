package com.hodora.app.data.tiles

import com.hodora.app.data.model.RidePoint
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.tan

/** Port of the tile math and CARTO URL builders in src/lib/offline-tiles.ts. */
enum class MapTheme { LIGHT, DARK }

data class TileCoord(val theme: MapTheme, val z: Int, val x: Int, val y: Int)

object TileUrls {
    val ZOOMS = listOf(11, 12, 13, 14, 15)
    const val MAX_TILES = 6000
    private const val MARGIN = 1

    /** Real upstream CARTO raster tile URL (@2x retina, tileSize declared 256 on the MapLibre side). */
    fun remoteUrl(theme: MapTheme, z: Int, x: Int, y: Int): String = when (theme) {
        MapTheme.LIGHT -> "https://basemaps.cartocdn.com/rastertiles/voyager/$z/$x/$y@2x.png"
        MapTheme.DARK -> "https://basemaps.cartocdn.com/dark_all/$z/$x/$y@2x.png"
    }

    private fun lonToTileX(lon: Double, z: Int): Int =
        floor((lon + 180.0) / 360.0 * (1 shl z)).toInt()

    private fun latToTileY(lat: Double, z: Int): Int {
        val latRad = Math.toRadians(lat.coerceIn(-85.05112878, 85.05112878))
        return floor((1.0 - ln(tan(latRad) + 1.0 / cos(latRad)) / PI) / 2.0 * (1 shl z)).toInt()
    }

    /** All tiles (both themes, all zooms, with a 1-tile margin) a route's line touches. */
    fun tilesForRoute(points: List<RidePoint>): Set<TileCoord> {
        val result = LinkedHashSet<TileCoord>()
        for (z in ZOOMS) {
            val maxIndex = (1 shl z) - 1
            for (p in points) {
                val cx = lonToTileX(p.lon, z)
                val cy = latToTileY(p.lat, z)
                for (dx in -MARGIN..MARGIN) {
                    for (dy in -MARGIN..MARGIN) {
                        val x = cx + dx
                        val y = cy + dy
                        if (x < 0 || y < 0 || x > maxIndex || y > maxIndex) continue
                        for (theme in MapTheme.entries) {
                            result += TileCoord(theme, z, x, y)
                        }
                    }
                }
            }
        }
        return result
    }
}
