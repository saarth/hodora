package app.hodora.mobile.ui.map

// Same free, no-key CARTO raster basemap the web app defaults to when
// VITE_MAPTILER_KEY is unset — see src/components/RouteMap.tsx. Porting the
// custom vector cycling style (src/lib/cycling-style.ts) is a later phase;
// this raster style is the zero-config default either way.
private const val LIGHT_TILES = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png"
private const val DARK_TILES = "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"
private const val ATTRIBUTION =
    "© OpenStreetMap contributors © <a href=\"https://carto.com/attributions\">CARTO</a>"

fun cartoStyleJson(dark: Boolean): String {
    val tiles = if (dark) DARK_TILES else LIGHT_TILES
    return """
        {
          "version": 8,
          "sources": {
            "carto": {
              "type": "raster",
              "tiles": ["$tiles"],
              "tileSize": 256,
              "maxzoom": 20,
              "attribution": "$ATTRIBUTION"
            }
          },
          "layers": [
            { "id": "carto-layer", "type": "raster", "source": "carto" }
          ]
        }
        """.trimIndent()
}
