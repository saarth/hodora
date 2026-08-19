package app.hodora.mobile.ui.ridedetail

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.hodora.mobile.data.model.Ride
import app.hodora.mobile.gpx.Bounds
import app.hodora.mobile.gpx.formatDistance
import app.hodora.mobile.gpx.formatElevation
import app.hodora.mobile.gpx.toGpx
import app.hodora.mobile.ui.map.RouteMapView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RideDetailScreen(
    rideId: String,
    onBack: () -> Unit,
    onNavigate: () -> Unit,
) {
    val viewModel: RideDetailViewModel =
        viewModel(factory = viewModelFactory { initializer { RideDetailViewModel(rideId) } })
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(rideId) { viewModel.load() }

    val exportLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/gpx+xml")) { uri ->
            val ride = state.ride
            if (uri != null && ride != null) {
                scope.launch(Dispatchers.IO) {
                    context.contentResolver.openOutputStream(uri)?.use { out ->
                        out.write(toGpx(ride.name, ride.points).toByteArray())
                    }
                }
            }
        }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.ride?.name ?: "Ride") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
                actions = {
                    val ride = state.ride
                    if (ride != null) {
                        TextButton(onClick = { exportLauncher.launch("${ride.name}.gpx") }) {
                            Text("Export")
                        }
                    }
                },
            )
        },
    ) { padding ->
        when {
            state.isLoading ->
                Box(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator() }

            state.error != null ->
                Box(modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp)) {
                    Text(state.error.orEmpty())
                }

            state.ride != null -> RideDetailContent(state.ride!!, onNavigate, Modifier.padding(padding))
        }
    }
}

@Composable
private fun RideDetailContent(
    ride: Ride,
    onNavigate: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        RouteMapView(
            points = ride.points,
            bounds = ride.bounds(),
            modifier = Modifier.fillMaxWidth().height(260.dp),
        )
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "${formatDistance(ride.distanceM)} · ${formatElevation(ride.ascentM)} ascent",
                style = MaterialTheme.typography.titleMedium,
            )
            ride.description?.let { description ->
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            Button(
                onClick = onNavigate,
                enabled = ride.points.size >= 2,
                modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
            ) {
                Text("Start navigation")
            }
            ElevationProfile(points = ride.points, modifier = Modifier.padding(top = 16.dp))
        }
    }
}

private fun Ride.bounds(): Bounds? {
    val minLat = this.minLat ?: return null
    val minLon = this.minLon ?: return null
    val maxLat = this.maxLat ?: return null
    val maxLon = this.maxLon ?: return null
    return Bounds(minLat, minLon, maxLat, maxLon)
}
