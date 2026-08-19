package app.hodora.mobile.ui.share

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.hodora.mobile.gpx.Bounds
import app.hodora.mobile.gpx.formatDistance
import app.hodora.mobile.gpx.formatElevation
import app.hodora.mobile.gpx.toGpx
import app.hodora.mobile.nav.compassLabel
import app.hodora.mobile.share.SharePayload
import app.hodora.mobile.share.SharedRide
import app.hodora.mobile.share.fetchSharedRide
import app.hodora.mobile.ui.map.RouteMapView
import app.hodora.mobile.weather.formatWindSpeed
import app.hodora.mobile.wind.WindSample
import app.hodora.mobile.wind.scoreRoute
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Native equivalent of src/routes/share.$id.tsx — reached only via the
 * https://hodora.app/share/{token} App Link (see AndroidManifest.xml and
 * MainActivity.kt's intent handling), deliberately outside the sign-in gate
 * HodoraNavHost otherwise enforces, same as the web share page being public.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SharedRideScreen(
    token: String,
    onDone: () -> Unit,
) {
    var payload by remember { mutableStateOf<SharePayload?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(token) {
        payload =
            try {
                fetchSharedRide(token)
            } catch (e: Exception) {
                error = e.message ?: "That shared route couldn't be found — the link may have expired or been removed."
                null
            }
    }

    val exportLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/gpx+xml")) { uri ->
            val ride = payload?.ride
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
                title = { Text("Shared route") },
                navigationIcon = { TextButton(onClick = onDone) { Text("Close") } },
            )
        },
    ) { padding ->
        when {
            payload == null && error == null ->
                Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            error != null ->
                Box(modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp)) {
                    Text(error.orEmpty())
                }
            else -> {
                val data = payload!!
                val ride = data.ride
                Column(modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
                    RouteMapView(
                        points = ride.points,
                        bounds = boundsOfPoints(ride),
                        modifier = Modifier.fillMaxWidth().height(260.dp),
                    )
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(ride.name, style = MaterialTheme.typography.titleLarge)
                        Text(
                            "${formatDistance(ride.distanceM)} · ${formatElevation(ride.ascentM)} ascent",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 4.dp),
                        )

                        val speedMs = data.wind.speedMs
                        val directionDeg = data.wind.directionDeg
                        if (speedMs != null && directionDeg != null) {
                            val score = scoreRoute(ride.points, WindSample(speedMs, directionDeg))
                            Text(
                                "Wind from ${compassLabel(directionDeg)} at ${formatWindSpeed(speedMs)}" +
                                    (score?.let { " · score ${it.windScore}/100" } ?: ""),
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                        }

                        OutlinedButton(
                            onClick = { exportLauncher.launch("${ride.name}.gpx") },
                            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                        ) { Text("Download GPX") }
                        Button(onClick = onDone, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                            Text("Open Hodora")
                        }
                    }
                }
            }
        }
    }
}

private fun boundsOfPoints(ride: SharedRide): Bounds? {
    if (ride.points.isEmpty()) return null
    return Bounds(
        minLat = ride.points.minOf { it.lat },
        minLon = ride.points.minOf { it.lon },
        maxLat = ride.points.maxOf { it.lat },
        maxLon = ride.points.maxOf { it.lon },
    )
}
