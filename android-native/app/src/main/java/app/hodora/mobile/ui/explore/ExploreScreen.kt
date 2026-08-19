package app.hodora.mobile.ui.explore

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.hodora.mobile.discover.DiscoveredRoute
import app.hodora.mobile.discover.DiscoveredRouteKind
import app.hodora.mobile.gpx.formatDistance
import app.hodora.mobile.gpx.formatElevation
import app.hodora.mobile.routing.boundsOf
import app.hodora.mobile.routing.toRidePoints
import app.hodora.mobile.ui.map.RouteMapView
import app.hodora.mobile.ui.permissions.fetchCurrentLocation
import app.hodora.mobile.ui.permissions.hasFineLocation
import kotlin.math.roundToInt

/**
 * Port of explore.tsx — signposted cycle routes near a point (Overpass) plus
 * generated loops of a target length, both from discover/Discover.kt, shown
 * on a map with a save-to-my-rides action per result.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreScreen(
    onBack: () -> Unit,
    onSaved: (rideId: String) -> Unit,
    viewModel: ExploreViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var fineGranted by remember { mutableStateOf(hasFineLocation(context)) }

    fun useCurrentLocationAndSearch() {
        fetchCurrentLocation(context) { location ->
            viewModel.setCenter(location)
            viewModel.search()
        }
    }

    val permissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
            fineGranted = granted.values.any { it }
            if (fineGranted) useCurrentLocationAndSearch()
        }

    LaunchedEffect(Unit) {
        if (fineGranted) {
            useCurrentLocationAndSearch()
        } else {
            permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }

    val selected = state.routes.find { it.id == state.selectedId }
    val previewPoints = remember(selected) { selected?.let { toRidePoints(it.path) }.orEmpty() }
    val previewBounds = remember(selected) { selected?.let { boundsOf(it.path) } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Explore") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
            RouteMapView(
                points = previewPoints,
                bounds = previewBounds,
                modifier = Modifier.fillMaxWidth().height(260.dp),
            )

            Column(modifier = Modifier.padding(16.dp)) {
                Text("Search radius · ${state.radiusKm} km", style = MaterialTheme.typography.labelSmall)
                Slider(
                    value = state.radiusKm.toFloat(),
                    onValueChange = { viewModel.setRadiusKm(it.roundToInt()) },
                    valueRange = 2f..40f,
                )
                Text(
                    "Loop length · ${state.loopKm} km",
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(top = 12.dp),
                )
                Slider(
                    value = state.loopKm.toFloat(),
                    onValueChange = { viewModel.setLoopKm(it.roundToInt()) },
                    valueRange = 10f..150f,
                )

                Row(modifier = Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { useCurrentLocationAndSearch() }, modifier = Modifier.weight(1f)) {
                        Text("My location")
                    }
                    Button(onClick = { viewModel.search() }, enabled = !state.isSearching, modifier = Modifier.weight(1f)) {
                        if (state.isSearching) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp))
                        } else {
                            Text("Search this area")
                        }
                    }
                }

                state.error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
                }

                if (state.searchedOnce && !state.isSearching && state.routes.isEmpty() && state.error == null) {
                    Text(
                        "No routes here yet — widen the radius, or search another spot.",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 16.dp),
                    )
                }

                Column(modifier = Modifier.padding(top = 16.dp)) {
                    state.routes.forEach { route ->
                        RouteResultCard(
                            route = route,
                            active = route.id == state.selectedId,
                            isSaving = state.isSaving,
                            onSelect = { viewModel.select(route.id) },
                            onSave = { viewModel.save(route, onSaved) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RouteResultCard(
    route: DiscoveredRoute,
    active: Boolean,
    isSaving: Boolean,
    onSelect: () -> Unit,
    onSave: () -> Unit,
) {
    Surface(
        onClick = onSelect,
        tonalElevation = if (active) 4.dp else 0.dp,
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(route.name, style = MaterialTheme.typography.titleSmall)
            val ascentText = if (route.ascentM > 0) " · ${formatElevation(route.ascentM)} up" else ""
            val kindLabel = if (route.kind == DiscoveredRouteKind.LOOP) "Generated loop" else route.subtitle
            Text(
                "${formatDistance(route.distanceM)}$ascentText · $kindLabel",
                style = MaterialTheme.typography.bodySmall,
            )
            if (active) {
                Button(onClick = onSave, enabled = !isSaving, modifier = Modifier.padding(top = 8.dp)) {
                    if (isSaving) CircularProgressIndicator(modifier = Modifier.size(18.dp)) else Text("Save to my rides")
                }
            }
        }
    }
}
