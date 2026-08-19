package app.hodora.mobile.ui.nav

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Air
import androidx.compose.material.icons.outlined.MyLocation
import androidx.compose.material.icons.outlined.VolumeOff
import androidx.compose.material.icons.outlined.VolumeUp
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.hodora.mobile.gpx.Bounds
import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.gpx.bearing
import app.hodora.mobile.gpx.formatDistance
import app.hodora.mobile.nav.NavState
import app.hodora.mobile.nav.NavUiState
import app.hodora.mobile.nav.NavWindInfo
import app.hodora.mobile.nav.NavigationService
import app.hodora.mobile.nav.WindEffect
import app.hodora.mobile.nav.compassLabel
import app.hodora.mobile.nav.getVoicePreference
import app.hodora.mobile.nav.setVoicePreference
import app.hodora.mobile.routing.LatLon
import app.hodora.mobile.ui.components.Caption
import app.hodora.mobile.ui.components.HodoraButton
import app.hodora.mobile.ui.components.HodoraButtonVariant
import app.hodora.mobile.ui.components.StatFigure
import app.hodora.mobile.ui.map.RouteMapView
import app.hodora.mobile.ui.permissions.BackgroundLocationChecklist
import app.hodora.mobile.ui.permissions.hasBackgroundLocation
import app.hodora.mobile.ui.permissions.hasFineLocation
import app.hodora.mobile.ui.permissions.isIgnoringBatteryOptimizations
import app.hodora.mobile.ui.theme.FrauncesItalic
import app.hodora.mobile.ui.theme.LocalHodoraColors
import app.hodora.mobile.weather.formatWindSpeed

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

    // One-shot alerts (rain, passing a ride note) — keyed on the alert's own
    // unique id, so a re-render with the same alert still showing doesn't
    // re-show the snackbar, but a genuinely new alert always does.
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(navState.rainAlert?.key) {
        val alert = navState.rainAlert ?: return@LaunchedEffect
        val message = if (alert.minutesAway <= 2) "Rain is starting" else "Rain expected in about ${alert.minutesAway} min"
        snackbarHostState.showSnackbar(message)
    }
    LaunchedEffect(navState.proximityAlert?.noteId) {
        val alert = navState.proximityAlert ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(alert.text)
    }

    val colors = LocalHodoraColors.current
    Scaffold(
        containerColor = colors.bg,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            if (!isThisRideRunning) {
                TopAppBar(
                    title = { Text(navState.rideName.ifEmpty { "Navigate" }) },
                    navigationIcon = {
                        TextButton(onClick = { stopServiceAndExit(context, onExit) }) { Text("Exit") }
                    },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        if (!isThisRideRunning) {
            BackgroundLocationChecklist(
                modifier = Modifier.padding(padding),
                fineGranted = fineGranted,
                backgroundGranted = backgroundGranted,
                batteryExempt = batteryExempt,
                error = navState.error,
                startLabel = "Start navigation",
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
private fun NavRunningContent(
    navState: NavUiState,
    modifier: Modifier = Modifier,
    onToggleVoice: () -> Unit,
    onStop: () -> Unit,
) {
    val colors = LocalHodoraColors.current
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

        // NavRunningContent recomposes on every NavState tick (~every 2s,
        // per location update), but RouteMapView only rebuilds its MapLibre
        // style once (styleReady) and mutates the existing GeoJsonSources
        // on every later call, so those recompositions no longer reload
        // basemap tiles or touch the camera.
        var followSuspended by remember { mutableStateOf(false) }
        var recenterRequests by remember { mutableStateOf(0) }
        Box(modifier = Modifier.fillMaxWidth().height(340.dp)) {
            RouteMapView(
                points = navState.routePoints,
                bounds = routeBounds(navState.routePoints),
                rejoinPath = navState.rejoinPath,
                rejoinPoint = if (navState.offRoute) navState.snap?.let { LatLon(it.lat, it.lon) } else null,
                rejoinRouted = navState.rejoinRouted,
                livePosition = navState.position?.let { LatLon(it.lat, it.lon) },
                headingDeg = navState.position?.headingDeg,
                followPosition = true,
                onFollowSuspendedChanged = { followSuspended = it },
                recenterRequests = recenterRequests,
                modifier = Modifier.fillMaxSize(),
            )
            Box(
                modifier =
                    Modifier
                        .align(Alignment.TopStart)
                        .padding(top = 52.dp, start = 16.dp)
                        .clip(RoundedCornerShape(50))
                        .background(colors.card.copy(alpha = 0.88f))
                        .clickable(onClick = onStop)
                        .padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                Text("Exit", color = colors.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
            if (followSuspended) {
                Box(
                    modifier =
                        Modifier
                            .align(Alignment.BottomEnd)
                            .padding(12.dp)
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(colors.primary)
                            .clickable { recenterRequests++ },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Outlined.MyLocation, contentDescription = "Recenter", tint = colors.primaryInk)
                }
            }
        }

        Column(modifier = Modifier.padding(20.dp)) {
            if (navState.isFinished) {
                Text(
                    text = "Arrived",
                    fontFamily = FrauncesItalic,
                    fontStyle = FontStyle.Italic,
                    fontSize = 34.sp,
                    fontWeight = FontWeight.Medium,
                    color = colors.ink,
                )
            } else {
                Text(
                    text = navState.nextCue?.text ?: "Head out",
                    fontFamily = FrauncesItalic,
                    fontStyle = FontStyle.Italic,
                    fontSize = 34.sp,
                    fontWeight = FontWeight.Medium,
                    color = colors.ink,
                    lineHeight = 38.sp,
                )
                StatFigure(
                    text = "${formatDistance(navState.nextCueDistanceM)} to next turn",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Normal,
                    color = colors.mutedInk,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }

            Row(modifier = Modifier.padding(top = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Caption("Remaining")
                    StatFigure(text = formatDistance(navState.distanceRemainingM), fontSize = 20.sp)
                }
                navState.wind?.let { wind ->
                    Box(
                        modifier =
                            Modifier
                                .padding(start = 20.dp)
                                .width(1.dp)
                                .height(32.dp)
                                .background(colors.border),
                    )
                    Row(
                        modifier = Modifier.padding(start = 20.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Outlined.Air, contentDescription = null, tint = colors.brass, modifier = Modifier.size(18.dp))
                        Column(modifier = Modifier.padding(start = 8.dp)) {
                            Caption(windEffectLabel(wind))
                            StatFigure(text = formatWindSpeed(wind.windSpeedMs), fontSize = 15.sp)
                        }
                    }
                }
            }

            Column(modifier = Modifier.padding(top = 20.dp)) {
                HodoraButton(
                    text = if (navState.voiceEnabled) "Voice announcements: on" else "Voice announcements: off",
                    onClick = onToggleVoice,
                    variant = HodoraButtonVariant.Outline,
                    height = 48.dp,
                    icon = {
                        Icon(
                            if (navState.voiceEnabled) Icons.Outlined.VolumeUp else Icons.Outlined.VolumeOff,
                            contentDescription = null,
                            modifier = Modifier.size(17.dp),
                        )
                    },
                )
                HodoraButton(
                    text = if (navState.isFinished) "Done" else "Stop navigation",
                    onClick = onStop,
                    variant = HodoraButtonVariant.Destructive,
                    modifier = Modifier.padding(top = 10.dp),
                )
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

private fun windEffectLabel(wind: NavWindInfo): String =
    when (wind.effect) {
        WindEffect.HEADWIND -> "Headwind"
        WindEffect.TAILWIND -> "Tailwind"
        WindEffect.CROSSWIND -> "Crosswind"
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
