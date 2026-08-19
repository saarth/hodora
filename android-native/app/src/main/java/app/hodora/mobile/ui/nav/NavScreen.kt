package app.hodora.mobile.ui.nav

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.hodora.mobile.gpx.Bounds
import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.gpx.bearing
import app.hodora.mobile.gpx.formatDistance
import app.hodora.mobile.nav.NavState
import app.hodora.mobile.nav.NavUiState
import app.hodora.mobile.nav.NavigationService
import app.hodora.mobile.nav.compassLabel
import app.hodora.mobile.nav.getVoicePreference
import app.hodora.mobile.nav.setVoicePreference
import app.hodora.mobile.routing.LatLon
import app.hodora.mobile.ui.map.RouteMapView

/**
 * NavigationService — not a ViewModel — owns navigation state, because
 * navigation must survive this screen being backgrounded or torn down (a
 * ViewModel is cleared with its screen; the whole point of Phase 3 is that
 * navigation keeps running after the rider leaves this screen). NavScreen
 * just starts/stops the service and renders NavState.uiState.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NavScreen(
    rideId: String,
    onExit: () -> Unit,
) {
    val context = LocalContext.current
    val navState by NavState.uiState.collectAsState()
    val isThisRideRunning = navState.isRunning && navState.rideId == rideId

    var fineGranted by remember { mutableStateOf(hasFineLocation(context)) }
    var backgroundGranted by remember { mutableStateOf(hasBackgroundLocation(context)) }
    var batteryExempt by remember { mutableStateOf(isIgnoringBatteryOptimizations(context)) }

    // Covers the rider coming back from the system Settings screen after
    // granting background location or battery exemption there — neither of
    // those returns a normal ActivityResult callback.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer =
            LifecycleEventObserver { _, event ->
                if (event == Lifecycle.Event.ON_RESUME) {
                    fineGranted = hasFineLocation(context)
                    backgroundGranted = hasBackgroundLocation(context)
                    batteryExempt = isIgnoringBatteryOptimizations(context)
                }
            }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val foregroundPermissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            fineGranted = hasFineLocation(context)
        }
    val backgroundPermissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
            backgroundGranted = hasBackgroundLocation(context)
        }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(navState.rideName.ifEmpty { "Navigate" }) },
                navigationIcon = {
                    TextButton(onClick = { stopServiceAndExit(context, onExit) }) { Text("Exit") }
                },
            )
        },
    ) { padding ->
        if (!isThisRideRunning) {
            PreNavChecklist(
                modifier = Modifier.padding(padding),
                fineGranted = fineGranted,
                backgroundGranted = backgroundGranted,
                batteryExempt = batteryExempt,
                error = navState.error,
                onRequestForeground = {
                    val permissions =
                        buildList {
                            add(Manifest.permission.ACCESS_FINE_LOCATION)
                            add(Manifest.permission.ACCESS_COARSE_LOCATION)
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                add(Manifest.permission.POST_NOTIFICATIONS)
                            }
                        }
                    foregroundPermissionLauncher.launch(permissions.toTypedArray())
                },
                onRequestBackground = {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        backgroundPermissionLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    }
                },
                onRequestBatteryExemption = {
                    context.startActivity(
                        Intent(
                            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:${context.packageName}"),
                        ),
                    )
                },
                onStart = {
                    val intent =
                        Intent(context, NavigationService::class.java).apply {
                            action = NavigationService.ACTION_START
                            putExtra(NavigationService.EXTRA_RIDE_ID, rideId)
                        }
                    ContextCompat.startForegroundService(context, intent)
                },
            )
        } else {
            NavRunningContent(
                navState = navState,
                modifier = Modifier.padding(padding),
                onToggleVoice = {
                    val enabled = !navState.voiceEnabled
                    setVoicePreference(context, enabled)
                    NavState.update { it.copy(voiceEnabled = enabled) }
                },
                onStop = { stopServiceAndExit(context, onExit) },
            )
        }
    }
}

@Composable
private fun PreNavChecklist(
    modifier: Modifier = Modifier,
    fineGranted: Boolean,
    backgroundGranted: Boolean,
    batteryExempt: Boolean,
    error: String?,
    onRequestForeground: () -> Unit,
    onRequestBackground: () -> Unit,
    onRequestBatteryExemption: () -> Unit,
    onStart: () -> Unit,
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
    ) {
        Text("Before you start", style = MaterialTheme.typography.titleMedium)

        ChecklistRow(
            title = "Location access",
            done = fineGranted,
            description = "Required — used to track your position on the route.",
            actionLabel = "Grant",
            onAction = onRequestForeground,
        )
        ChecklistRow(
            title = "Background location",
            done = backgroundGranted,
            description = "Recommended — keeps turn cues and voice announcements working with your phone locked or the app in your pocket. Choose \"Allow all the time\" when prompted.",
            actionLabel = "Grant",
            onAction = onRequestBackground,
            enabled = fineGranted,
        )
        ChecklistRow(
            title = "Battery optimization",
            done = batteryExempt,
            description = "Recommended — some phones aggressively kill background apps; exempting Hodora stops that from cutting off navigation mid-ride.",
            actionLabel = "Exempt",
            onAction = onRequestBatteryExemption,
        )

        error?.let {
            Text(
                text = it,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 16.dp),
            )
        }

        Button(
            onClick = onStart,
            enabled = fineGranted,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(top = 24.dp),
        ) {
            Text("Start navigation")
        }
    }
}

@Composable
private fun ChecklistRow(
    title: String,
    done: Boolean,
    description: String,
    actionLabel: String,
    onAction: () -> Unit,
    enabled: Boolean = true,
) {
    Column(modifier = Modifier.padding(top = 16.dp)) {
        Text(
            text = if (done) "✓ $title" else title,
            style = MaterialTheme.typography.titleSmall,
            color = if (done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
        )
        Text(text = description, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
        if (!done) {
            OutlinedButton(onClick = onAction, enabled = enabled, modifier = Modifier.padding(top = 8.dp)) {
                Text(actionLabel)
            }
        }
    }
}

@Composable
private fun NavRunningContent(
    navState: NavUiState,
    modifier: Modifier = Modifier,
    onToggleVoice: () -> Unit,
    onStop: () -> Unit,
) {
    Column(modifier = modifier.fillMaxSize()) {
        if (navState.offRoute) {
            Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "Off route · ${formatDistance(navState.rejoinDistanceM)}",
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                    Text(
                        text = rejoinMessage(navState),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
        }

        // The full route, for orientation — a live position puck/heading
        // arrow on this map is deferred polish, not in this first cut.
        // Known cost worth fixing before this ships: RouteMapView reloads
        // its whole MapLibre style on every AndroidView `update` (see the
        // comment on that composable), and NavRunningContent recomposes on
        // every NavState tick (~every 2s, per location update) since it
        // reads other navState fields too — so this map currently reloads
        // tiles roughly every 2 seconds during a ride. Fine for proving the
        // service/notification/TTS pipeline works; needs RouteMapView to
        // mutate its existing GeoJsonSource instead of rebuilding the style,
        // or this map split into its own composable keyed only on
        // routePoints, before this is a ride-worthy nav screen.
        RouteMapView(
            points = navState.routePoints,
            bounds = routeBounds(navState.routePoints),
            rejoinPath = navState.rejoinPath,
            rejoinPoint = if (navState.offRoute) navState.snap?.let { LatLon(it.lat, it.lon) } else null,
            rejoinRouted = navState.rejoinRouted,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(220.dp),
        )

        Column(modifier = Modifier.padding(16.dp)) {
            if (navState.isFinished) {
                Text("Arrived", style = MaterialTheme.typography.headlineSmall)
            } else {
                Text(
                    text = navState.nextCue?.text ?: "Head out",
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    text = "${formatDistance(navState.nextCueDistanceM)} to next turn",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            Text(
                text = "${formatDistance(navState.distanceRemainingM)} remaining",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 8.dp),
            )

            Column(modifier = Modifier.padding(top = 16.dp)) {
                OutlinedButton(onClick = onToggleVoice) {
                    Text(if (navState.voiceEnabled) "Voice announcements: on" else "Voice announcements: off")
                }
                Button(
                    onClick = onStop,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                ) {
                    Text(if (navState.isFinished) "Done" else "Stop navigation")
                }
            }
        }
    }
}

private fun stopServiceAndExit(
    context: Context,
    onExit: () -> Unit,
) {
    context.startService(Intent(context, NavigationService::class.java).apply { action = NavigationService.ACTION_STOP })
    NavState.reset()
    onExit()
}

private fun hasFineLocation(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED

private fun hasBackgroundLocation(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
}

private fun isIgnoringBatteryOptimizations(context: Context): Boolean {
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return powerManager.isIgnoringBatteryOptimizations(context.packageName)
}

private fun routeBounds(points: List<RidePoint>): Bounds? {
    if (points.isEmpty()) return null
    return Bounds(
        minLat = points.minOf { it.lat },
        minLon = points.minOf { it.lon },
        maxLat = points.maxOf { it.lat },
        maxLon = points.maxOf { it.lon },
    )
}

/** Compass direction to head in: along the cycling path back to the track when one's been found, otherwise straight at the closest route point. Port of rejoinBearing in src/routes/rides.$id.nav.tsx. */
private fun rejoinDirectionLabel(navState: NavUiState): String? {
    val position = navState.position ?: return null
    val target =
        navState.rejoinPath.getOrNull(1)
            ?: navState.snap?.let { LatLon(it.lat, it.lon) }
            ?: return null
    return compassLabel(bearing(position.lat, position.lon, target.lat, target.lon))
}

private fun rejoinMessage(navState: NavUiState): String {
    val direction = rejoinDirectionLabel(navState)
    return when {
        navState.rejoinLoading && navState.rejoinPath.size < 2 -> "Finding a cycling route back to the track…"
        navState.rejoinRouted ->
            "Follow the cycling route back" + (direction?.let { " — head $it to start" }.orEmpty())
        else -> "Head" + (direction?.let { " $it" }.orEmpty()) + " to the closest point of the route"
    }
}
