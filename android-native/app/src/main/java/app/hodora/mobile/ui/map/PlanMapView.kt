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
import app.hodora.mobile.routing.LatLon
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource

private const val ROUTE_SOURCE_ID = "plan-route"
private const val ROUTE_LAYER_ID = "plan-route-line"
private const val WAYPOINTS_SOURCE_ID = "plan-waypoints"
private const val WAYPOINTS_LAYER_ID = "plan-waypoints-circles"
private const val CURRENT_LOCATION_ZOOM = 14.0

/**
 * Tap-to-plan map — mirrors RouteMap's onMapClick handling in
 * src/routes/plan.tsx. Kept separate from RouteMapView (ride detail's
 * static map) rather than generalizing the two into one composable:
 * planning needs click handling and waypoint markers that ride detail
 * doesn't, and the two have no other logic in common yet.
 */
@Composable
fun PlanMapView(
    routePath: List<LatLon>,
    waypoints: List<LatLon>,
    onMapClick: (LatLon) -> Unit,
    currentLocation: LatLon? = null,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val dark = isSystemInDarkTheme()

    // onMapClick is captured once here, not re-read on every recomposition —
    // fine as long as the caller passes a stable reference (PlanViewModel's
    // addWaypoint), which PlanScreen does.
    val mapView =
        remember {
            MapView(context).apply {
                id = View.generateViewId()
                onCreate(null)
                getMapAsync { map ->
                    map.addOnMapClickListener { latLng ->
                        onMapClick(LatLon(latLng.latitude, latLng.longitude))
                        true
                    }
                }
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

    // Built once (styleReady, a plain flag rather than Compose state so
    // flipping it doesn't itself trigger a recomposition); every later
    // `update` — one per reroute, so per waypoint tap or profile change —
    // just mutates the existing sources' data instead of rebuilding the
    // whole style and re-fetching every basemap tile. Same fix as
    // RouteMapView, applied here too for consistency even though the nav
    // screen's ~2s tick made the cost far more visible there.
    val styleReady = remember { booleanArrayOf(false) }

    // Centers on the rider's own position once, as soon as it's available —
    // otherwise the map opens at MapLibre's raw default (zoomed out over
    // 0,0). Only fires while there's nothing planned yet; once the rider has
    // dropped a waypoint their in-progress plan wins and this never
    // recenters the camera out from under them.
    val centeredOnLocation = remember { booleanArrayOf(false) }

    AndroidView(
        factory = { mapView },
        modifier = modifier,
        update = { view ->
            view.getMapAsync { map ->
                if (!styleReady[0]) {
                    styleReady[0] = true
                    map.setStyle(Style.Builder().fromJson(cartoStyleJson(dark))) { style ->
                        style.addSource(GeoJsonSource(ROUTE_SOURCE_ID, routeLineGeoJson(routePath)))
                        style.addLayer(
                            LineLayer(ROUTE_LAYER_ID, ROUTE_SOURCE_ID).withProperties(
                                PropertyFactory.lineColor(Color.parseColor("#1F3A2E")),
                                PropertyFactory.lineWidth(4f),
                                PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
                                PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
                            ),
                        )
                        style.addSource(GeoJsonSource(WAYPOINTS_SOURCE_ID, waypointsGeoJson(waypoints)))
                        style.addLayer(
                            CircleLayer(WAYPOINTS_LAYER_ID, WAYPOINTS_SOURCE_ID).withProperties(
                                PropertyFactory.circleRadius(6f),
                                PropertyFactory.circleColor(Color.parseColor("#1F3A2E")),
                                PropertyFactory.circleStrokeWidth(2f),
                                PropertyFactory.circleStrokeColor(Color.parseColor("#FFFFFF")),
                            ),
                        )
                    }
                } else {
                    val style = map.style ?: return@getMapAsync
                    style.getSourceAs<GeoJsonSource>(ROUTE_SOURCE_ID)?.setGeoJson(routeLineGeoJson(routePath))
                    style.getSourceAs<GeoJsonSource>(WAYPOINTS_SOURCE_ID)?.setGeoJson(waypointsGeoJson(waypoints))
                }
                if (!centeredOnLocation[0] && currentLocation != null && waypoints.isEmpty()) {
                    centeredOnLocation[0] = true
                    map.moveCamera(
                        CameraUpdateFactory.newLatLngZoom(
                            LatLng(currentLocation.lat, currentLocation.lon),
                            CURRENT_LOCATION_ZOOM,
                        ),
                    )
                }
            }
        },
    )
}

private fun routeLineGeoJson(path: List<LatLon>): String {
    if (path.size < 2) return """{"type":"FeatureCollection","features":[]}"""
    val coordinates = path.joinToString(prefix = "[", postfix = "]") { "[${it.lon},${it.lat}]" }
    return """{"type":"Feature","properties":{},"geometry":{"type":"LineString","coordinates":$coordinates}}"""
}

private fun waypointsGeoJson(points: List<LatLon>): String {
    val features =
        points.joinToString(prefix = "[", postfix = "]") {
            """{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[${it.lon},${it.lat}]}}"""
        }
    return """{"type":"FeatureCollection","features":$features}"""
}
