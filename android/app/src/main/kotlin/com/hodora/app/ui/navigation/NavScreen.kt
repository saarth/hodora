package com.hodora.app.ui.navigation

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.TurnLeft
import androidx.compose.material.icons.filled.TurnRight
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hodora.app.data.format.Formatters
import com.hodora.app.data.model.TurnDirection
import com.hodora.app.data.model.MeasurementUnit as HodoraUnit
import com.hodora.app.data.nav.NavMath
import com.hodora.app.ui.components.ElevationChart
import com.hodora.app.ui.components.RouteMapView
import org.maplibre.android.geometry.LatLng

/**
 * Turn-by-turn navigation screen. The real tracking work happens in
 * [NavigationService] (a foreground service, so it survives screen-off /
 * backgrounding); this screen just requests permissions, starts/stops it,
 * and renders its published [NavServiceState].
 */
@Composable
fun NavScreen(
    onExit: () -> Unit,
    viewModel: NavViewModel = hiltViewModel(),
) {
    val ride by viewModel.ride.collectAsStateWithLifecycle()
    val unit by viewModel.unit.collectAsStateWithLifecycle()
    val navState by viewModel.navState.collectAsStateWithLifecycle()
    val metric = unit == HodoraUnit.METRIC
    val isDark = isSystemInDarkTheme()

    val permissions = remember {
        buildList {
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    var permissionsGranted by remember { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        permissionsGranted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true
    }

    LaunchedEffect(Unit) { permissionLauncher.launch(permissions.toTypedArray()) }
    LaunchedEffect(permissionsGranted) {
        if (permissionsGranted) viewModel.startNavigation()
    }

    val view = LocalView.current
    DisposableEffect(Unit) {
        view.keepScreenOn = true
        onDispose { view.keepScreenOn = false }
    }

    Box(Modifier.fillMaxSize()) {
        val currentRide = ride
        if (currentRide == null || navState == null) {
            Column(
                Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(if (permissionsGranted) "Waiting for GPS…" else "Location permission needed to navigate")
            }
        } else {
            val state = navState!!
            RouteMapView(
                points = currentRide.points,
                progressIndex = state.snap.index,
                liveFix = LatLng(state.snap.lat, state.snap.lon),
                follow = true,
                pitchDegrees = 45.0,
                headingDegrees = state.headingDeg,
                isDarkTheme = isDark,
                tileUrlTemplate = { dark -> viewModel.tileUrlTemplate(dark) },
                modifier = Modifier.fillMaxSize(),
            )

            Column(
                Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
                    .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top))
                    .padding(12.dp),
            ) {
                if (state.offRoute) {
                    Surface(
                        color = MaterialTheme.colorScheme.errorContainer,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    ) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Warning, contentDescription = null)
                            Text(" Off route", modifier = Modifier.padding(start = 8.dp))
                        }
                    }
                }

                TurnCard(state)
            }

            IconButton(
                onClick = {
                    viewModel.stopNavigation()
                    onExit()
                },
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top))
                    .padding(12.dp)
                    .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(50)),
            ) {
                Icon(Icons.Filled.Close, contentDescription = "End navigation")
            }

            Column(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom))
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.92f)),
            ) {
                MetricsRow(state, metric)
                ElevationChart(
                    points = currentRide.points,
                    metric = metric,
                    progressM = state.snap.progressM,
                    modifier = Modifier.fillMaxWidth().height(70.dp).padding(horizontal = 12.dp, vertical = 4.dp),
                )
            }

            if (state.finished) {
                FinishOverlay(
                    onDone = {
                        viewModel.stopNavigation()
                        onExit()
                    },
                )
            }
        }
    }
}

@Composable
private fun TurnCard(state: NavServiceState) {
    val turn = state.nextTurn
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(16.dp),
        shadowElevation = 4.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            val icon = when (turn?.direction) {
                TurnDirection.LEFT, TurnDirection.SHARP_LEFT -> Icons.Filled.TurnLeft
                TurnDirection.RIGHT, TurnDirection.SHARP_RIGHT -> Icons.Filled.TurnRight
                null -> null
            }
            icon?.let { Icon(it, contentDescription = null, modifier = Modifier.padding(end = 12.dp)) }
            Column {
                Text(
                    turn?.let { NavMath.turnLabel(it.direction) } ?: "On route",
                    style = MaterialTheme.typography.titleMedium,
                )
                if (turn != null) {
                    val distanceToTurn = (turn.at - state.snap.progressM).coerceAtLeast(0.0)
                    Text(
                        Formatters.distance(distanceToTurn, true),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun MetricsRow(state: NavServiceState, metric: Boolean) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        val distanceToGo = (state.distanceM - state.snap.progressM).coerceAtLeast(0.0)
        MetricItem("To go", Formatters.distance(distanceToGo, metric))
        MetricItem("Climb left", Formatters.elevation(state.remainingAscentM, metric))
        MetricItem("Grade", "${state.gradePercent.let { Math.round(it) }}%")
        MetricItem("Speed", "${Formatters.speed(state.speedMps, metric)} ${if (metric) "km/h" else "mph"}")
    }
}

@Composable
private fun MetricItem(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleMedium)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun FinishOverlay(onDone: () -> Unit) {
    Box(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background.copy(alpha = 0.95f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Ride finished!", style = MaterialTheme.typography.headlineMedium)
            Button(onClick = onDone, modifier = Modifier.padding(top = 16.dp)) {
                Text("Done")
            }
        }
    }
}
