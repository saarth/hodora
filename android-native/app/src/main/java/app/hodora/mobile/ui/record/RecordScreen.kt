package app.hodora.mobile.ui.record

import android.Manifest
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.MyLocation
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.hodora.mobile.data.repository.RidesRepository
import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.gpx.buildParsedRide
import app.hodora.mobile.gpx.formatDistance
import app.hodora.mobile.gpx.formatDuration
import app.hodora.mobile.gpx.formatElevation
import app.hodora.mobile.gpx.formatSpeed
import app.hodora.mobile.gpx.haversine
import app.hodora.mobile.record.RecordState
import app.hodora.mobile.record.RecordStatus
import app.hodora.mobile.record.RecordUiState
import app.hodora.mobile.record.RecordingService
import app.hodora.mobile.ui.components.Caption
import app.hodora.mobile.ui.components.HodoraButton
import app.hodora.mobile.ui.components.HodoraButtonVariant
import app.hodora.mobile.ui.components.HodoraCard
import app.hodora.mobile.ui.components.HodoraChip
import app.hodora.mobile.ui.components.StatFigure
import app.hodora.mobile.ui.map.RouteMapView
import app.hodora.mobile.ui.permissions.BackgroundLocationChecklist
import app.hodora.mobile.ui.permissions.hasBackgroundLocation
import app.hodora.mobile.ui.permissions.hasFineLocation
import app.hodora.mobile.ui.permissions.isIgnoringBatteryOptimizations
import app.hodora.mobile.ui.ridedetail.ElevationProfile
import app.hodora.mobile.ui.theme.LocalHodoraColors
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

/**
 * RecordingService — not a ViewModel, same reasoning as NavScreen/
 * NavigationService — owns the actual recording so a ride survives this
 * screen being backgrounded or torn down. RecordScreen just starts/stops/
 * pauses/resumes the service and renders RecordState.uiState, then (once
 * stopped) saves straight from here since by that point the rider is back
 * in the foreground UI and no service round-trip is needed.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecordScreen(
    onSaved: (rideId: String) -> Unit,
    onExit: () -> Unit,
) {
    val context = LocalContext.current
    val recordState by RecordState.uiState.collectAsState()
    val scope = rememberCoroutineScope()
    val repository = remember { RidesRepository() }
    val colors = LocalHodoraColors.current

    var fineGranted by remember { mutableStateOf(hasFineLocation(context)) }
    var backgroundGranted by remember { mutableStateOf(hasBackgroundLocation(context)) }
    var batteryExempt by remember { mutableStateOf(isIgnoringBatteryOptimizations(context)) }

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

    var name by remember { mutableStateOf("") }
    var isSaving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }

    fun sendAction(action: String) {
        context.startService(Intent(context, RecordingService::class.java).apply { this.action = action })
    }

    fun exitTracking() {
        if (recordState.status == RecordStatus.RECORDING || recordState.status == RecordStatus.PAUSED) {
            sendAction(RecordingService.ACTION_FINISH)
        }
        RecordState.reset()
        onExit()
    }

    Scaffold(containerColor = colors.bg, contentWindowInsets = WindowInsets(0, 0, 0, 0)) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (recordState.status) {
                RecordStatus.IDLE ->
                    BackgroundLocationChecklist(
                        fineGranted = fineGranted,
                        backgroundGranted = backgroundGranted,
                        batteryExempt = batteryExempt,
                        error = recordState.error,
                        startLabel = "Start recording",
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
                            val intent = Intent(context, RecordingService::class.java).apply { action = RecordingService.ACTION_START }
                            ContextCompat.startForegroundService(context, intent)
                        },
                    )

                RecordStatus.RECORDING, RecordStatus.PAUSED ->
                    RecordTrackingContent(
                        recordState = recordState,
                        onBack = ::exitTracking,
                        onPauseResume = {
                            sendAction(
                                if (recordState.status == RecordStatus.RECORDING) {
                                    RecordingService.ACTION_PAUSE
                                } else {
                                    RecordingService.ACTION_RESUME
                                },
                            )
                        },
                        onFinish = { sendAction(RecordingService.ACTION_FINISH) },
                    )

                RecordStatus.STOPPED ->
                    RecordStoppedContent(
                        recordState = recordState,
                        name = name,
                        onNameChange = { name = it },
                        isSaving = isSaving,
                        saveError = saveError,
                        onDiscard = {
                            RecordState.reset()
                            name = ""
                        },
                        onSave = {
                            isSaving = true
                            saveError = null
                            scope.launch {
                                try {
                                    val fallbackName = "Ride — ${DateFormat.getDateInstance().format(Date())}"
                                    val parsed = buildParsedRide(recordState.rawPoints, name.trim().ifEmpty { fallbackName })
                                    val rideId = repository.createRide(parsed, isRecorded = true)
                                    RecordState.reset()
                                    onSaved(rideId)
                                } catch (e: Exception) {
                                    saveError = e.message ?: "Could not save this ride"
                                } finally {
                                    isSaving = false
                                }
                            }
                        },
                    )
            }
        }
    }
}

/** Mirrors record.tsx's `live` useMemo — cumulative distance from the raw points, no smoothing (that's only for buildParsedRide's final save pass). */
private fun liveRidePoints(recordState: RecordUiState): List<RidePoint> {
    var distance = 0.0
    val points = ArrayList<RidePoint>(recordState.rawPoints.size)
    recordState.rawPoints.forEachIndexed { index, p ->
        if (index > 0) {
            val prev = recordState.rawPoints[index - 1]
            distance += haversine(prev.lat, prev.lon, p.lat, p.lon)
        }
        points.add(RidePoint(lat = p.lat, lon = p.lon, ele = p.ele, d = Math.round(distance).toInt(), t = p.t))
    }
    return points
}

@Composable
private fun RecordTrackingContent(
    recordState: RecordUiState,
    onBack: () -> Unit,
    onPauseResume: () -> Unit,
    onFinish: () -> Unit,
) {
    val colors = LocalHodoraColors.current
    val points = remember(recordState.rawPoints) { liveRidePoints(recordState) }
    val avgSpeedMps = if (recordState.elapsedSec > 10) recordState.distanceM / recordState.elapsedSec else null
    // Same follow/recenter pattern as NavScreen's map — see RouteMapView.kt.
    var followSuspended by remember { mutableStateOf(false) }
    var recenterRequests by remember { mutableStateOf(0) }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Box(modifier = Modifier.fillMaxWidth().height(300.dp)) {
            RouteMapView(
                points = points,
                bounds = null,
                livePosition = recordState.livePosition,
                headingDeg = recordState.headingDeg,
                followPosition = true,
                onFollowSuspendedChanged = { followSuspended = it },
                recenterRequests = recenterRequests,
                modifier = Modifier.fillMaxSize(),
            )
            HodoraChip(onClick = onBack, modifier = Modifier.align(Alignment.TopStart).padding(top = 52.dp, start = 16.dp)) {
                Icon(Icons.Outlined.ArrowBack, contentDescription = "Back", tint = colors.ink, modifier = Modifier.size(18.dp))
                Text("Record a ride", color = colors.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
            Box(
                modifier =
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 52.dp, end = 16.dp)
                        .clip(RoundedCornerShape(50))
                        .background(lerp(colors.card, colors.destructive, 0.12f))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier =
                            Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(colors.destructive),
                    )
                    Text(
                        text = "REC",
                        color = colors.destructive,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
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
            Row(horizontalArrangement = Arrangement.spacedBy(40.dp)) {
                Stat("Elapsed", formatDuration(recordState.elapsedSec), modifier = Modifier.weight(1f))
                Stat("Distance", formatDistance(recordState.distanceM), modifier = Modifier.weight(1f))
            }
            Row(modifier = Modifier.padding(top = 20.dp), horizontalArrangement = Arrangement.spacedBy(40.dp)) {
                Stat("Speed", recordState.currentSpeedMps?.let { formatSpeed(it) } ?: "—", modifier = Modifier.weight(1f))
                Stat("Avg speed", avgSpeedMps?.let { formatSpeed(it) } ?: "—", modifier = Modifier.weight(1f))
            }
            Stat("Elevation gain", formatElevation(recordState.ascentM), modifier = Modifier.padding(top = 20.dp))

            Row(modifier = Modifier.padding(top = 24.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (recordState.status == RecordStatus.RECORDING) {
                    HodoraButton(
                        text = "Pause",
                        onClick = onPauseResume,
                        variant = HodoraButtonVariant.Outline,
                        modifier = Modifier.weight(1f),
                        icon = { Icon(Icons.Outlined.Pause, contentDescription = null, modifier = Modifier.size(17.dp)) },
                    )
                } else {
                    HodoraButton(
                        text = "Resume",
                        onClick = onPauseResume,
                        variant = HodoraButtonVariant.Outline,
                        modifier = Modifier.weight(1f),
                        icon = { Icon(Icons.Outlined.PlayArrow, contentDescription = null, modifier = Modifier.size(17.dp)) },
                    )
                }
                HodoraButton(
                    text = "Finish",
                    onClick = onFinish,
                    enabled = recordState.rawPoints.size >= 2,
                    variant = HodoraButtonVariant.Destructive,
                    modifier = Modifier.weight(1f),
                    icon = { Icon(Icons.Outlined.Stop, contentDescription = null, modifier = Modifier.size(17.dp)) },
                )
            }

            if (points.size > 1) {
                HodoraCard(modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Caption("Elevation")
                        ElevationProfile(points = points, modifier = Modifier.padding(top = 8.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun RecordStoppedContent(
    recordState: RecordUiState,
    name: String,
    onNameChange: (String) -> Unit,
    isSaving: Boolean,
    saveError: String?,
    onDiscard: () -> Unit,
    onSave: () -> Unit,
) {
    val colors = LocalHodoraColors.current
    val points = remember(recordState.rawPoints) { liveRidePoints(recordState) }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Text(
            text = "Ride complete",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = colors.ink,
            modifier = Modifier.padding(top = 40.dp),
        )
        StatFigure(
            text = "${formatDistance(recordState.distanceM)} · ${formatElevation(recordState.ascentM)} ascent · ${formatDuration(recordState.elapsedSec)}",
            fontSize = 14.sp,
            fontWeight = FontWeight.Normal,
            color = colors.mutedInk,
            modifier = Modifier.padding(top = 6.dp),
        )

        OutlinedTextField(
            value = name,
            onValueChange = onNameChange,
            label = { Text("Ride name") },
            placeholder = { Text("Ride — ${DateFormat.getDateInstance().format(Date())}") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
        )

        saveError?.let {
            Text(it, color = colors.destructive, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
        }

        Row(modifier = Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            HodoraButton(
                text = "Discard",
                onClick = onDiscard,
                enabled = !isSaving,
                variant = HodoraButtonVariant.Outline,
                modifier = Modifier.weight(1f),
            )
            HodoraButton(
                text = if (isSaving) "Saving…" else "Save ride",
                onClick = onSave,
                enabled = !isSaving && recordState.rawPoints.size >= 2,
                modifier = Modifier.weight(1f),
                icon = if (isSaving) {
                    { CircularProgressIndicator(modifier = Modifier.size(18.dp), color = colors.primaryInk, strokeWidth = 2.dp) }
                } else {
                    null
                },
            )
        }

        if (points.size > 1) {
            HodoraCard(modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Caption("Elevation")
                    ElevationProfile(points = points, modifier = Modifier.padding(top = 8.dp))
                }
            }
        }
    }
}

@Composable
private fun Stat(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Caption(label)
        StatFigure(text = value, fontSize = 24.sp, modifier = Modifier.padding(top = 2.dp))
    }
}

