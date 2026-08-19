package app.hodora.mobile.ui.map

import android.graphics.Color
import android.view.View
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.hodora.mobile.gpx.Bounds
import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.gpx.splitBySegments
import app.hodora.mobile.routing.LatLon
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource

private const val ROUTE_SOURCE_ID = "route"
private const val ROUTE_LAYER_ID = "route-line"
private const val REJOIN_SOURCE_ID = "rejoin"
private const val REJOIN_LAYER_ID = "rejoin-line"
private const val REJOIN_POINT_SOURCE_ID = "rejoin-point"
private const val REJOIN_POINT_LAYER_ID = "rejoin-point-layer"
private const val ROUTE_BOUNDS_PADDING_PX = 64

// Approximates the web app's --warning token (src/styles.css, an OKLCH
// value not easily hand-converted to sRGB hex) — close enough for a status
// color; worth wiring up to the real design tokens once native theming
// goes beyond the single racing-green primary.
private const val WARNING_COLOR = "#D97706"

/**
 * Route line + CARTO basemap, mirroring src/components/RouteMap.tsx's
 * default (non-vector) mode. [rejoinPath]/[rejoinPoint]/[rejoinRouted] draw
 * the off-route guide line — see NavigationService's rejoin handling and
 * src/lib/rejoin.ts — and are no-ops (empty/null) outside of navigation.
 */
@Composable
fun RouteMapView(
    points: List<RidePoint>,
    bounds: Bounds?,
    modifier: Modifier = Modifier,
    rejoinPath: List<LatLon> = emptyList(),
    rejoinPoint: LatLon? = null,
    rejoinRouted: Boolean = false,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val dark = isSystemInDarkTheme()

    val mapView =
        remember {
            MapView(context).apply {
                id = View.generateViewId()
                onCreate(null)
            }
        }

    DisposableEffect(lifecycleOwner) {
        val lifecycle = lifecycleOwner.lifecycle
        val observer =
            LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_START -> mapView.onStart()
                    Lifecycle.Event.ON_RESUME -> mapView.onResume()
                    Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                    Lifecycle.Event.ON_STOP -> mapView.onStop()
                    Lifecycle.Event.ON_DESTROY -> mapView.onDestroy()
                    else -> {}
                }
            }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    // `update` re-runs on every recomposition of the caller — once, in
    // practice, on the static ride-detail screen, but roughly every 2
    // seconds on the nav screen, where rejoinPath/rejoinPoint change on
    // every location tick while off-route. Previously this rebuilt the
    // whole Style (and re-fetched every basemap tile) on every single call;
    // now the style/sources/layers are built exactly once — via
    // `styleReady`, a plain flag rather than Compose state since flipping
    // it must not itself trigger a recomposition — and every later call
    // just mutates the existing GeoJsonSources' data and the rejoin layer's
    // paint properties in place, which is cheap and doesn't touch the
    // basemap at all.
    val styleReady = remember { booleanArrayOf(false) }

    AndroidView(
        factory = { mapView },
        modifier = modifier,
        update = { view ->
            view.getMapAsync { map ->
                if (!styleReady[0]) {
                    styleReady[0] = true
                    map.setStyle(Style.Builder().fromJson(cartoStyleJson(dark))) { style ->
                        style.addSource(GeoJsonSource(ROUTE_SOURCE_ID, routeGeoJson(points)))
                        style.addLayer(
                            LineLayer(ROUTE_LAYER_ID, ROUTE_SOURCE_ID).withProperties(
                                PropertyFactory.lineColor(Color.parseColor("#1F3A2E")),
                                PropertyFactory.lineWidth(4f),
                                PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
                                PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
                            ),
                        )

                        // A real cycling path back to the track is drawn
                        // solid; the straight-line fallback (or the brief
                        // window before the first rejoin fetch resolves)
                        // stays dashed — same distinction
                        // src/components/RouteMap.tsx draws. Dasharray/width
                        // get updated in place below as rejoinRouted flips,
                        // same as the source data.
                        style.addSource(GeoJsonSource(REJOIN_SOURCE_ID, rejoinLineGeoJson(rejoinPath)))
                        style.addLayer(
                            LineLayer(REJOIN_LAYER_ID, REJOIN_SOURCE_ID).withProperties(
                                PropertyFactory.lineColor(Color.parseColor(WARNING_COLOR)),
                                PropertyFactory.lineWidth(if (rejoinRouted) 5f else 3.5f),
                                PropertyFactory.lineDasharray(
                                    if (rejoinRouted) arrayOf(1f, 0f) else arrayOf(1.5f, 1.5f),
                                ),
                                PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
                            ),
                        )
                        style.addSource(GeoJsonSource(REJOIN_POINT_SOURCE_ID, pointGeoJson(rejoinPoint)))
                        style.addLayer(
                            CircleLayer(REJOIN_POINT_LAYER_ID, REJOIN_POINT_SOURCE_ID).withProperties(
                                PropertyFactory.circleRadius(7f),
                                PropertyFactory.circleColor(Color.parseColor(WARNING_COLOR)),
                                PropertyFactory.circleStrokeWidth(2.5f),
                                PropertyFactory.circleStrokeColor(Color.WHITE),
                            ),
                        )

                        // Fit once, on first load, rather than on every
                        // update — re-fitting to the full route's bounds
                        // every ~2s during navigation would fight any
                        // manual pan/zoom the rider does mid-ride.
                        latLngBoundsFor(points, bounds)?.let { latLngBounds ->
                            map.moveCamera(CameraUpdateFactory.newLatLngBounds(latLngBounds, ROUTE_BOUNDS_PADDING_PX))
                        }
                    }
                } else {
                    val style = map.style ?: return@getMapAsync
                    style.getSourceAs<GeoJsonSource>(ROUTE_SOURCE_ID)?.setGeoJson(routeGeoJson(points))
                    style.getSourceAs<GeoJsonSource>(REJOIN_SOURCE_ID)?.setGeoJson(rejoinLineGeoJson(rejoinPath))
                    style.getSourceAs<GeoJsonSource>(REJOIN_POINT_SOURCE_ID)?.setGeoJson(pointGeoJson(rejoinPoint))
                    (style.getLayer(REJOIN_LAYER_ID) as? LineLayer)?.setProperties(
                        PropertyFactory.lineWidth(if (rejoinRouted) 5f else 3.5f),
                        PropertyFactory.lineDasharray(if (rejoinRouted) arrayOf(1f, 0f) else arrayOf(1.5f, 1.5f)),
                    )
                }
            }
        },
    )
}

private fun routeGeoJson(points: List<RidePoint>): String {
    val coordinates =
        splitBySegments(points).joinToString(prefix = "[", postfix = "]") { segment ->
            segment.joinToString(prefix = "[", postfix = "]") { "[${it.lon},${it.lat}]" }
        }
    return """{"type":"Feature","properties":{},"geometry":{"type":"MultiLineString","coordinates":$coordinates}}"""
}

private fun rejoinLineGeoJson(path: List<LatLon>): String {
    if (path.size < 2) return """{"type":"FeatureCollection","features":[]}"""
    val coordinates = path.joinToString(prefix = "[", postfix = "]") { "[${it.lon},${it.lat}]" }
    return """{"type":"Feature","properties":{},"geometry":{"type":"LineString","coordinates":$coordinates}}"""
}

private fun pointGeoJson(point: LatLon?): String {
    if (point == null) return """{"type":"FeatureCollection","features":[]}"""
    return """{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[${point.lon},${point.lat}]}}"""
}

private fun latLngBoundsFor(
    points: List<RidePoint>,
    bounds: Bounds?,
): LatLngBounds? {
    if (bounds != null) {
        return LatLngBounds.from(bounds.maxLat, bounds.maxLon, bounds.minLat, bounds.minLon)
    }
    if (points.isEmpty()) return null
    val builder = LatLngBounds.Builder()
    points.forEach { builder.include(LatLng(it.lat, it.lon)) }
    return builder.build()
}
