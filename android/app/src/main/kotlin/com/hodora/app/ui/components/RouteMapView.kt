package com.hodora.app.ui.components

import android.content.Context
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.hodora.app.data.model.RidePoint
import com.hodora.app.data.model.splitBySegments
import com.hodora.app.ui.theme.HodoraTheme
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory.circleColor
import org.maplibre.android.style.layers.PropertyFactory.circleOpacity
import org.maplibre.android.style.layers.PropertyFactory.circleRadius
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeColor
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeWidth
import org.maplibre.android.style.layers.PropertyFactory.lineCap
import org.maplibre.android.style.layers.PropertyFactory.lineColor
import org.maplibre.android.style.layers.PropertyFactory.lineJoin
import org.maplibre.android.style.layers.PropertyFactory.lineOpacity
import org.maplibre.android.style.layers.PropertyFactory.lineWidth
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.MultiLineString
import org.maplibre.geojson.Point

private const val SOURCE_BASEMAP = "basemap"
private const val LAYER_BASEMAP = "basemap-layer"
private const val SOURCE_ROUTE = "route"
private const val LAYER_ROUTE_CASING = "route-casing"
private const val LAYER_ROUTE_LINE = "route-line"
private const val SOURCE_ROUTE_DONE = "route-done"
private const val LAYER_ROUTE_DONE = "route-done-line"
private const val SOURCE_ENDPOINTS = "endpoints"
private const val LAYER_ENDPOINTS = "endpoints-layer"
private const val SOURCE_RIDER = "rider"
private const val LAYER_RIDER_PULSE = "rider-pulse"
private const val LAYER_RIDER_CORE = "rider-core"

/**
 * Compose wrapper around a MapLibre MapView. Layer set is a direct port of
 * src/components/RouteMap.tsx's non-rejoin layers (rejoin/get-back-on-route
 * drawing is a Phase 3 item, see the Android build plan).
 */
@Composable
fun RouteMapView(
    points: List<RidePoint>,
    modifier: Modifier = Modifier,
    progressIndex: Int? = null,
    liveFix: LatLng? = null,
    follow: Boolean = false,
    pitchDegrees: Double = 0.0,
    headingDegrees: Double = 0.0,
    isDarkTheme: Boolean,
    tileUrlTemplate: (isDark: Boolean) -> String,
) {
    val mapView = rememberMapViewWithLifecycle()
    val extraColors = HodoraTheme.extraColors
    val routeColor = extraColors.route.toArgb()
    val doneColor = 0x88888888.toInt()
    val backgroundColorInt = androidx.compose.material3.MaterialTheme.colorScheme.background.toArgb()
    val foregroundColorInt = androidx.compose.material3.MaterialTheme.colorScheme.onBackground.toArgb()
    val primaryColorInt = androidx.compose.material3.MaterialTheme.colorScheme.primary.toArgb()

    var mapRef by remember { androidx.compose.runtime.mutableStateOf<MapLibreMap?>(null) }
    var boundsFitted by remember(points) { androidx.compose.runtime.mutableStateOf(false) }

    AndroidView(factory = { mapView }, modifier = modifier.fillMaxSize()) { view ->
        view.getMapAsync { map ->
            mapRef = map
            val styleJson = buildStyleJson(tileUrlTemplate(isDarkTheme))
            map.setStyle(Style.Builder().fromJson(styleJson)) { style ->
                setUpLayers(style, routeColor, doneColor, foregroundColorInt, backgroundColorInt, primaryColorInt)
                updateRouteData(style, points)
                updateDoneData(style, points, progressIndex)
                updateEndpoints(style, points, routeColor, foregroundColorInt)
                updateRider(style, liveFix)
                if (!boundsFitted) {
                    fitToRoute(map, points)
                    boundsFitted = true
                }
            }
        }
    }

    LaunchedEffect(points, progressIndex, isDarkTheme) {
        val map = mapRef ?: return@LaunchedEffect
        val style = map.style ?: return@LaunchedEffect
        updateRouteData(style, points)
        updateDoneData(style, points, progressIndex)
        updateEndpoints(style, points, routeColor, foregroundColorInt)
    }

    LaunchedEffect(liveFix, follow, headingDegrees, pitchDegrees) {
        val map = mapRef ?: return@LaunchedEffect
        val style = map.style
        if (style != null) updateRider(style, liveFix)
        if (follow && liveFix != null) {
            map.easeCamera(
                CameraUpdateFactory.newCameraPosition(
                    CameraPosition.Builder()
                        .target(liveFix)
                        .zoom(maxOf(map.cameraPosition.zoom, 15.5))
                        .bearing(headingDegrees)
                        .tilt(pitchDegrees)
                        .build(),
                ),
                700,
            )
        }
    }
}

@Composable
private fun rememberMapViewWithLifecycle(): MapView {
    val context = LocalContext.current
    val mapView = remember { createMapView(context) }
    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner) {
        val lifecycle = lifecycleOwner.lifecycle
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                Lifecycle.Event.ON_DESTROY -> mapView.onDestroy()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            mapView.onDestroy()
        }
    }
    return mapView
}

private fun createMapView(context: Context): MapView {
    org.maplibre.android.MapLibre.getInstance(context)
    val mapView = MapView(context)
    mapView.onCreate(null)
    return mapView
}

private fun buildStyleJson(tileUrlTemplate: String): String = """
{
  "version": 8,
  "sources": {
    "$SOURCE_BASEMAP": {
      "type": "raster",
      "tiles": ["$tileUrlTemplate"],
      "tileSize": 256,
      "attribution": "&#169; OpenStreetMap contributors &#169; CARTO"
    }
  },
  "layers": [
    { "id": "$LAYER_BASEMAP", "type": "raster", "source": "$SOURCE_BASEMAP" }
  ]
}
""".trimIndent()

private fun setUpLayers(
    style: Style,
    routeColor: Int,
    doneColor: Int,
    foregroundColor: Int,
    backgroundColor: Int,
    primaryColor: Int,
) {
    if (style.getSource(SOURCE_ROUTE) != null) return // already set up

    style.addSource(GeoJsonSource(SOURCE_ROUTE))
    style.addLayer(
        LineLayer(LAYER_ROUTE_CASING, SOURCE_ROUTE).withProperties(
            lineWidth(8f),
            lineOpacity(0.45f),
            lineColor(backgroundColor),
            lineCap(Property.LINE_CAP_ROUND),
            lineJoin(Property.LINE_JOIN_ROUND),
        ),
    )
    style.addLayer(
        LineLayer(LAYER_ROUTE_LINE, SOURCE_ROUTE).withProperties(
            lineWidth(4.5f),
            lineColor(routeColor),
            lineCap(Property.LINE_CAP_ROUND),
            lineJoin(Property.LINE_JOIN_ROUND),
        ),
    )

    style.addSource(GeoJsonSource(SOURCE_ROUTE_DONE))
    style.addLayer(
        LineLayer(LAYER_ROUTE_DONE, SOURCE_ROUTE_DONE).withProperties(
            lineWidth(4.5f),
            lineOpacity(0.9f),
            lineColor(doneColor),
            lineCap(Property.LINE_CAP_ROUND),
            lineJoin(Property.LINE_JOIN_ROUND),
        ),
    )

    style.addSource(GeoJsonSource(SOURCE_ENDPOINTS))
    style.addLayer(
        CircleLayer(LAYER_ENDPOINTS, SOURCE_ENDPOINTS).withProperties(
            circleRadius(6f),
            circleColor(routeColor),
            circleStrokeWidth(2.5f),
            circleStrokeColor(backgroundColor),
        ),
    )

    style.addSource(GeoJsonSource(SOURCE_RIDER))
    style.addLayer(
        CircleLayer(LAYER_RIDER_PULSE, SOURCE_RIDER).withProperties(
            circleRadius(16f),
            circleColor(primaryColor),
            circleOpacity(0.25f),
        ),
    )
    style.addLayer(
        CircleLayer(LAYER_RIDER_CORE, SOURCE_RIDER).withProperties(
            circleRadius(7f),
            circleColor(primaryColor),
            circleStrokeWidth(2f),
            circleStrokeColor(backgroundColor),
        ),
    )
}

private fun updateRouteData(style: Style, points: List<RidePoint>) {
    val source = (style.getSource(SOURCE_ROUTE) as? GeoJsonSource) ?: return
    val lines = points.splitBySegments()
        .filter { it.size >= 2 }
        .map { seg -> LineString.fromLngLats(seg.map { Point.fromLngLat(it.lon, it.lat) }) }
    source.setGeoJson(FeatureCollection.fromFeature(Feature.fromGeometry(MultiLineString.fromLineStrings(lines))))
}

private fun updateDoneData(style: Style, points: List<RidePoint>, progressIndex: Int?) {
    val source = (style.getSource(SOURCE_ROUTE_DONE) as? GeoJsonSource) ?: return
    if (progressIndex == null || progressIndex < 1) {
        source.setGeoJson(FeatureCollection.fromFeatures(emptyArray()))
        return
    }
    val donePoints = points.subList(0, (progressIndex + 1).coerceAtMost(points.size))
    val lines = donePoints.splitBySegments()
        .filter { it.size >= 2 }
        .map { seg -> LineString.fromLngLats(seg.map { Point.fromLngLat(it.lon, it.lat) }) }
    source.setGeoJson(FeatureCollection.fromFeature(Feature.fromGeometry(MultiLineString.fromLineStrings(lines))))
}

private fun updateEndpoints(style: Style, points: List<RidePoint>, routeColor: Int, foregroundColor: Int) {
    val source = (style.getSource(SOURCE_ENDPOINTS) as? GeoJsonSource) ?: return
    if (points.isEmpty()) {
        source.setGeoJson(FeatureCollection.fromFeatures(emptyArray()))
        return
    }
    val start = Feature.fromGeometry(Point.fromLngLat(points.first().lon, points.first().lat))
    val end = Feature.fromGeometry(Point.fromLngLat(points.last().lon, points.last().lat))
    source.setGeoJson(FeatureCollection.fromFeatures(arrayOf(start, end)))
}

private fun updateRider(style: Style, liveFix: LatLng?) {
    val source = (style.getSource(SOURCE_RIDER) as? GeoJsonSource) ?: return
    if (liveFix == null) {
        source.setGeoJson(FeatureCollection.fromFeatures(emptyArray()))
        return
    }
    source.setGeoJson(
        FeatureCollection.fromFeature(Feature.fromGeometry(Point.fromLngLat(liveFix.longitude, liveFix.latitude))),
    )
}

private fun fitToRoute(map: MapLibreMap, points: List<RidePoint>) {
    if (points.size < 2) return
    val builder = LatLngBounds.Builder()
    points.forEach { builder.include(LatLng(it.lat, it.lon)) }
    try {
        map.moveCamera(CameraUpdateFactory.newLatLngBounds(builder.build(), 48))
    } catch (e: Exception) {
        // degenerate bounds (e.g. a single point after simplification) — ignore
    }
}
