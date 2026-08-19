package app.hodora.mobile.ui.wind

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.hodora.mobile.gpx.formatDistance
import app.hodora.mobile.nav.compassLabel
import app.hodora.mobile.weather.formatWindSpeed
import app.hodora.mobile.wind.WindScoreResult

/**
 * Simplified port of wind.tsx — see WindViewModel's doc comment for what's
 * trimmed (current conditions only, no day/hour forecast picker yet).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WindScreen(
    onBack: () -> Unit,
    viewModel: WindViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var menuExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Wind") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
            )
        },
    ) { padding ->
        when {
            state.isLoading ->
                Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }

            state.summaries.isEmpty() ->
                Box(modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp)) {
                    Text(state.error ?: "No saved rides yet — save a route first to check its wind.")
                }

            else ->
                Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp).verticalScroll(rememberScrollState())) {
                    val selectedName = state.summaries.find { it.id == state.selectedRideId }?.name ?: "Choose a ride"
                    Box {
                        TextButton(onClick = { menuExpanded = true }) { Text(selectedName) }
                        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            state.summaries.forEach { summary ->
                                DropdownMenuItem(
                                    text = { Text(summary.name) },
                                    onClick = {
                                        menuExpanded = false
                                        viewModel.selectRide(summary.id)
                                    },
                                )
                            }
                        }
                    }

                    when {
                        state.isLoadingRide ->
                            Box(modifier = Modifier.fillMaxWidth().padding(top = 24.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator()
                            }
                        state.error != null ->
                            Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 16.dp))
                        state.scoreResult != null && state.weather != null ->
                            WindResultContent(
                                distanceM = state.ride?.distanceM ?: 0.0,
                                windDirectionDeg = state.weather!!.windDirectionDeg,
                                windSpeedMs = state.weather!!.windSpeedMs,
                                result = state.scoreResult!!,
                            )
                        else ->
                            Text(
                                "No elevation/GPS data on this route to score.",
                                modifier = Modifier.padding(top = 16.dp),
                            )
                    }
                }
        }
    }
}

@Composable
private fun WindResultContent(
    distanceM: Double,
    windDirectionDeg: Double,
    windSpeedMs: Double,
    result: WindScoreResult,
) {
    Column(modifier = Modifier.padding(top = 16.dp)) {
        Text(formatDistance(distanceM), style = MaterialTheme.typography.bodySmall)
        Text(
            "Wind score: ${result.windScore}/100",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(
            "Wind from ${compassLabel(windDirectionDeg)} at ${formatWindSpeed(windSpeedMs)}",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 4.dp),
        )

        WindMixRow("Tailwind", result.tailwindPct, modifier = Modifier.padding(top = 20.dp))
        WindMixRow("Headwind", result.headwindPct, modifier = Modifier.padding(top = 8.dp))
        WindMixRow("Crosswind", result.crosswindPct, modifier = Modifier.padding(top = 8.dp))
    }
}

@Composable
private fun WindMixRow(
    label: String,
    percent: Int,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Row(modifier = Modifier.fillMaxWidth()) {
            Text(label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            Text("$percent%", style = MaterialTheme.typography.bodySmall)
        }
        LinearProgressIndicator(
            progress = { percent / 100f },
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        )
    }
}
