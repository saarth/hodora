package app.hodora.mobile.ui.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
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
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource

private const val ROUTE_SOURCE_ID = "route"
private const val ROUTE_LAYER_ID = "route-line"
private const val REJOIN_SOURCE_ID = "rejoin"
private const val REJOIN_LAYER_ID = "rejoin-line"
private const val REJOIN_POINT_SOURCE_ID = "rejoin-point"
private const val REJOIN_POINT_LAYER_ID = "rejoin-point-layer"
private const val LIVE_POSITION_SOURCE_ID = "live-position"
private const val LIVE_POSITION_LAYER_ID = "live-position-arrow"
private const val LIVE_POSITION_ICON_ID = "live-position-icon"
private const val ROUTE_BOUNDS_PADDING_PX = 64
// Roughly Google Maps' default turn-by-turn zoom — close enough to read
// street names and see the next turn coming, without needing map rotation
// (which would also require re-deriving the live-position icon's rotation
// math below, currently anchored to a north-up map).
private const val NAV_FOLLOW_ZOOM = 16.5

// Approximates the web app's --warning token (src/styles.css, an OKLCH
// value not easily hand-converted to sRGB hex) — close enough for a status
// color; worth wiring up to the real design tokens once native theming
// goes beyond the single racing-green primary.
private const val WARNING_COLOR = "#D97706"

/**
 * Route line + CARTO basemap, mirroring src/components/RouteMap.tsx's
 * default (non-vector) mode. [rejoinPath]/[rejoinPoint]/[rejoinRouted] draw
 * the off-route guide line — see NavigationService's rejoin handling and
 * src/lib/rejoin.ts. [livePosition]/[headingDeg] draw the rider's position
 * as a heading-rotated arrow during navigation. All are no-ops (empty/null)
 * outside of the nav screen.
 */
@Composable
fun RouteMapView(
    points: List<RidePoint>,
    bounds: Bounds?,
    modifier: Modifier = Modifier,
    rejoinPath: List<LatLon> = emptyList(),
    rejoinPoint: LatLon? = null,
    rejoinRouted: Boolean = false,
    livePosition: LatLon? = null,
    headingDeg: Double? = null,
    // Ride detail wants the classic overview (whole route fit once, static
    // from then on). The nav screen wants a real turn-by-turn camera —
    // centered close on the rider, following them tick to tick — since a
    // rider mid-ride cares about what's right in front of them, not the
    // whole route zoomed out. Falls back to the overview-style fit while
    // waiting on the first GPS fix, then switches to follow mode for good
    // once livePosition starts arriving.
    followPosition: Boolean = false,
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

    // Separate from styleReady: on the nav screen, `points`/`bounds` start
    // out empty (NavigationService.start() loads the ride asynchronously)
    // and only become real a beat after this composable's first call — by
    // which point styleReady has already flipped, so the fit-to-bounds
    // logic can't live inside that one-shot block or it would silently
    // never run. Instead it's checked on every `update`, same cadence as
    // the ~2s nav-tick recompositions, until it succeeds once.
    val boundsFitted = remember { booleanArrayOf(false) }

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

                        // The rider's own position — a heading-rotated arrow
                        // (rotated in map space, not screen space, so it
                        // stays correct as the map itself doesn't rotate).
                        // Falls back to pointing north (0°) when no heading
                        // is available yet.
                        style.addImage(LIVE_POSITION_ICON_ID, buildArrowBitmap())
                        style.addSource(GeoJsonSource(LIVE_POSITION_SOURCE_ID, pointGeoJson(livePosition)))
                        style.addLayer(
                            SymbolLayer(LIVE_POSITION_LAYER_ID, LIVE_POSITION_SOURCE_ID).withProperties(
                                PropertyFactory.iconImage(LIVE_POSITION_ICON_ID),
                                PropertyFactory.iconSize(0.6f),
                                PropertyFactory.iconRotate((headingDeg ?: 0.0).toFloat()),
                                PropertyFactory.iconRotationAlignment(Property.ICON_ROTATION_ALIGNMENT_MAP),
                                PropertyFactory.iconAllowOverlap(true),
                                PropertyFactory.iconIgnorePlacement(true),
                            ),
                        )
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
                    style.getSourceAs<GeoJsonSource>(LIVE_POSITION_SOURCE_ID)?.setGeoJson(pointGeoJson(livePosition))
                    (style.getLayer(LIVE_POSITION_LAYER_ID) as? SymbolLayer)?.setProperties(
                        PropertyFactory.iconRotate((headingDeg ?: 0.0).toFloat()),
                    )
                }

                if (followPosition && livePosition != null) {
                    // Recenter on every tick — this is meant to fight manual
                    // pan/zoom, unlike the bounds-fit below, because a
                    // turn-by-turn view that drifts off the rider's position
                    // isn't helping them navigate. (A "recenter" button to
                    // let the rider deliberately look ahead is a reasonable
                    // follow-up, not done here.)
                    map.moveCamera(
                        CameraUpdateFactory.newLatLngZoom(
                            LatLng(livePosition.lat, livePosition.lon),
                            NAV_FOLLOW_ZOOM,
                        ),
                    )
                } else if (!boundsFitted[0]) {
                    // Fit once, whenever real bounds first become available,
                    // rather than on every update — re-fitting to the full
                    // route's bounds every ~2s would fight any manual
                    // pan/zoom on the static ride-detail overview. Also
                    // covers the nav screen before its first GPS fix lands.
                    latLngBoundsFor(points, bounds)?.let { latLngBounds ->
                        boundsFitted[0] = true
                        fitBounds(view, map, latLngBounds)
                    }
                }
            }
        },
    )
}

/**
 * Fits the camera to [latLngBounds], deferring until [mapView] actually has
 * a measured pixel size. `newLatLngBounds` computes the camera from the
 * MapView's current width/height — calling it the instant the style finishes
 * loading can race Compose's AndroidView layout pass (the native view is
 * still 0x0), which doesn't throw, it just silently produces the wrong
 * (usually fully zoomed-out) camera instead of fitting the route.
 */
private fun fitBounds(
    mapView: MapView,
    map: MapLibreMap,
    latLngBounds: LatLngBounds,
) {
    if (mapView.width > 0 && mapView.height > 0) {
        map.moveCamera(CameraUpdateFactory.newLatLngBounds(latLngBounds, ROUTE_BOUNDS_PADDING_PX))
        return
    }
    mapView.addOnLayoutChangeListener(
        object : View.OnLayoutChangeListener {
            override fun onLayoutChange(
                v: View,
                left: Int,
                top: Int,
                right: Int,
                bottom: Int,
                oldLeft: Int,
                oldTop: Int,
                oldRight: Int,
                oldBottom: Int,
            ) {
                if (right - left > 0 && bottom - top > 0) {
                    mapView.removeOnLayoutChangeListener(this)
                    map.moveCamera(CameraUpdateFactory.newLatLngBounds(latLngBounds, ROUTE_BOUNDS_PADDING_PX))
                }
            }
        },
    )
}

/**
 * A simple filled kite/arrow shape pointing up (north, i.e. 0° rotation),
 * for the live-position SymbolLayer — drawn in code rather than as a
 * drawable resource decoded to a Bitmap, since it's small and this is the
 * only place that needs it.
 */
private fun buildArrowBitmap(
    sizePx: Int = 96,
    fillColorHex: String = "#1F3A2E",
): Bitmap {
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val size = sizePx.toFloat()
    val center = size / 2f

    val path =
        Path().apply {
            moveTo(center, size * 0.06f)
            lineTo(size * 0.84f, size * 0.94f)
            lineTo(center, size * 0.72f)
            lineTo(size * 0.16f, size * 0.94f)
            close()
        }

    canvas.drawPath(
        path,
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor(fillColorHex)
            style = Paint.Style.FILL
        },
    )
    canvas.drawPath(
        path,
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = size * 0.08f
            strokeJoin = Paint.Join.ROUND
        },
    )
    return bitmap
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
