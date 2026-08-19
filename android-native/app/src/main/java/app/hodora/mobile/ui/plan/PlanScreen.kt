package app.hodora.mobile.ui.plan

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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.hodora.mobile.gpx.formatDistance
import app.hodora.mobile.routing.BikeProfile
import app.hodora.mobile.ui.map.PlanMapView

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanScreen(
    onBack: () -> Unit,
    onSaved: (rideId: String) -> Unit,
    viewModel: PlanViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsState()

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
