package app.hodora.mobile.ui.plan

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import app.hodora.mobile.gpx.formatDistance
import app.hodora.mobile.routing.BikeProfile
import app.hodora.mobile.routing.LatLon
import app.hodora.mobile.ui.map.PlanMapView
import com.google.android.gms.location.CancellationTokenSource
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanScreen(
    onBack: () -> Unit,
    onSaved: (rideId: String) -> Unit,
    viewModel: PlanViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    // Centers the map on where the rider actually is when they open the
    // planner, rather than the raw MapLibre default (zoomed out over
    // 0,0) — same reasoning as the auto-fit-to-route fix in RouteMapView,
    // just for the "no route yet" case. Only fetched once; PlanMapView
    // itself won't recenter on it after the rider has dropped a waypoint.
    var currentLocation by remember { mutableStateOf<LatLon?>(null) }
    val locationPermissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
            if (granted.values.any { it }) {
                fetchCurrentLocation(context) { currentLocation = it }
            }
        }
    LaunchedEffect(Unit) {
        val hasPermission =
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        if (hasPermission) {
            fetchCurrentLocation(context) { currentLocation = it }
        } else {
            locationPermissionLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Plan a route") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            PlanMapView(
                routePath = state.routed?.path.orEmpty(),
                waypoints = state.waypoints,
                onMapClick = viewModel::addWaypoint,
                currentLocation = currentLocation,
                modifier = Modifier.fillMaxWidth().weight(1f),
            )

            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
            ) {
                Text("Routing style", style = MaterialTheme.typography.labelSmall)
                Row(
                    modifier = Modifier.padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    BikeProfile.entries.forEach { profile ->
                        FilterChip(
                            selected = state.profile == profile,
                            onClick = { viewModel.setProfile(profile) },
                            label = { Text(profile.label) },
                        )
                    }
                }

                Row(
                    modifier = Modifier.padding(top = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(onClick = viewModel::undoWaypoint, enabled = state.waypoints.isNotEmpty()) {
                        Text("Undo point")
                    }
                    OutlinedButton(onClick = viewModel::clearWaypoints, enabled = state.waypoints.isNotEmpty()) {
                        Text("Clear")
                    }
                }

                Text(
                    text = planSummary(state),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 16.dp),
                )
                val routed = state.routed
                if (routed != null && !routed.routed) {
                    Text(
                        text = "Routers unreachable — showing a straight-line estimate.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
                state.error?.let { message ->
                    Text(
                        text = message,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }

                if ((routed?.path?.size ?: 0) > 1) {
                    OutlinedTextField(
                        value = state.name,
                        onValueChange = viewModel::setName,
                        label = { Text("Route name") },
                        placeholder = { Text("Planned route") },
                        singleLine = true,
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .padding(top = 16.dp),
                    )
                    Button(
                        onClick = { viewModel.save(onSaved) },
                        enabled = !state.isSaving,
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .padding(top = 8.dp),
                    ) {
                        if (state.isSaving) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp))
                        } else {
                            Text("Save to my rides")
                        }
                    }
                }
            }
        }
    }
}

private fun planSummary(state: PlanUiState): String {
    if (state.waypoints.isEmpty()) return "Tap the map to drop your first point."
    val count = "${state.waypoints.size} point${if (state.waypoints.size == 1) "" else "s"}"
    val distance = state.routed?.let { " · ${formatDistance(it.distanceM)}" }.orEmpty()
    val routing = if (state.isRouting) " · routing…" else ""
    return count + distance + routing
}

// lastLocation is fast but can be null (fresh install, location services
// just enabled) — falls back to a fresh fix in that case. Caller already
// checked ACCESS_FINE_LOCATION/ACCESS_COARSE_LOCATION before invoking this.
@SuppressLint("MissingPermission")
private fun fetchCurrentLocation(
    context: Context,
    onResult: (LatLon) -> Unit,
) {
    val client = LocationServices.getFusedLocationProviderClient(context)
    client.lastLocation.addOnSuccessListener { location ->
        if (location != null) {
            onResult(LatLon(location.latitude, location.longitude))
        } else {
            client
                .getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, CancellationTokenSource().token)
                .addOnSuccessListener { fresh -> fresh?.let { onResult(LatLon(it.latitude, it.longitude)) } }
        }
    }
}
