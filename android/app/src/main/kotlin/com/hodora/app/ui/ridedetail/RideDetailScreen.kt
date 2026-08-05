package com.hodora.app.ui.ridedetail

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hodora.app.data.format.Formatters
import com.hodora.app.data.model.MeasurementUnit as HodoraUnit
import com.hodora.app.ui.components.ElevationChart
import com.hodora.app.ui.components.ElevationSummary
import com.hodora.app.ui.components.RouteMapView
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RideDetailScreen(
    onBack: () -> Unit,
    onStartNavigation: (String) -> Unit,
    viewModel: RideDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val ride = uiState.ride
    val isDark = isSystemInDarkTheme()
    val metric = uiState.unit == HodoraUnit.METRIC

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(ride?.name ?: "Ride") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        if (ride == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Stat(label = "Distance", value = Formatters.distance(ride.distanceM, metric))
                Stat(label = "Ascent", value = Formatters.elevation(ride.ascentM, metric))
                Stat(label = "Descent", value = Formatters.elevation(ride.descentM, metric))
            }

            Box(
                Modifier
                    .fillMaxWidth()
                    .height(260.dp)
                    .padding(horizontal = 16.dp)
                    .clip(RoundedCornerShape(16.dp)),
            ) {
                RouteMapView(
                    points = ride.points,
                    isDarkTheme = isDark,
                    tileUrlTemplate = { dark -> viewModel.tileUrlTemplate(dark) },
                )
            }

            OfflineCard(
                isSavedOffline = uiState.isSavedOffline,
                estimateMb = uiState.offlineEstimateMb,
                downloadProgress = uiState.downloadProgress,
                onDownload = viewModel::downloadOffline,
                onRemove = viewModel::removeOffline,
                modifier = Modifier.fillMaxWidth().padding(16.dp),
            )

            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                ElevationSummary(ride.ascentM, ride.descentM, metric)
                ElevationChart(
                    points = ride.points,
                    metric = metric,
                    modifier = Modifier.fillMaxWidth().height(200.dp).padding(top = 8.dp),
                )
            }

            Button(
                onClick = { onStartNavigation(ride.id) },
                modifier = Modifier.fillMaxWidth().padding(16.dp),
            ) {
                Icon(Icons.Filled.Navigation, contentDescription = null)
                Text(" Start navigation", modifier = Modifier.padding(start = 8.dp))
            }
        }
    }
}

@Composable
private fun Stat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge)
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun OfflineCard(
    isSavedOffline: Boolean,
    estimateMb: Double,
    downloadProgress: Float?,
    onDownload: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (isSavedOffline) Icons.Filled.CloudDone else Icons.Filled.CloudDownload,
                    contentDescription = null,
                )
                Column(Modifier.padding(start = 12.dp).weight(1f)) {
                    Text(if (isSavedOffline) "Available offline" else "Save for offline use")
                    Text(
                        "~${estimateMb.roundToInt()} MB of map tiles",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (downloadProgress == null) {
                    if (isSavedOffline) {
                        OutlinedButton(onClick = onRemove) { Text("Remove") }
                    } else {
                        Button(onClick = onDownload) { Text("Download") }
                    }
                }
            }
            if (downloadProgress != null) {
                LinearProgressIndicator(
                    progress = { downloadProgress },
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                )
            }
        }
    }
}
