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
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource

private const val ROUTE_SOURCE_ID = "route"
private const val ROUTE_LAYER_ID = "route-line"
private const val ROUTE_BOUNDS_PADDING_PX = 64

/** Route line + CARTO basemap, mirroring src/components/RouteMap.tsx's default (non-vector) mode. */
@Composable
fun RouteMapView(
    points: List<RidePoint>,
    bounds: Bounds?,
    modifier: Modifier = Modifier,
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

    // `update` re-runs on every recomposition where `points`/`bounds` change
    // identity (once, in practice, when the ride finishes loading) — each
    // run rebuilds the Style from scratch via setStyle(), so there's no
    // stale-source case to guard against here. Fine for a static ride-detail
    // map; a live-updating screen (Phase 3's navigation view) will need to
    // mutate the existing source instead of reloading the whole style.
    AndroidView(
        factory = { mapView },
        modifier = modifier,
        update = { view ->
            view.getMapAsync { map ->
                map.setStyle(Style.Builder().fromJson(cartoStyleJson(dark))) { style ->
                    if (style.getSource(ROUTE_SOURCE_ID) == null) {
                        style.addSource(GeoJsonSource(ROUTE_SOURCE_ID, routeGeoJson(points)))
                        style.addLayer(
                            LineLayer(ROUTE_LAYER_ID, ROUTE_SOURCE_ID).withProperties(
                                PropertyFactory.lineColor(Color.parseColor("#1F3A2E")),
                                PropertyFactory.lineWidth(4f),
                                PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
                                PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
                            ),
                        )
                    }
                    latLngBoundsFor(points, bounds)?.let { latLngBounds ->
                        map.moveCamera(CameraUpdateFactory.newLatLngBounds(latLngBounds, ROUTE_BOUNDS_PADDING_PX))
                    }
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
