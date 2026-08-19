package app.hodora.mobile.ui.record

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
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
import app.hodora.mobile.ui.map.RouteMapView
import app.hodora.mobile.ui.permissions.BackgroundLocationChecklist
import app.hodora.mobile.ui.permissions.hasBackgroundLocation
import app.hodora.mobile.ui.permissions.hasFineLocation
import app.hodora.mobile.ui.permissions.isIgnoringBatteryOptimizations
import app.hodora.mobile.ui.ridedetail.ElevationProfile
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

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Record a ride") },
                navigationIcon = {
                    TextButton(onClick = {
                        if (recordState.status == RecordStatus.RECORDING || recordState.status == RecordStatus.PAUSED) {
                            sendAction(RecordingService.ACTION_FINISH)
                        }
                        RecordState.reset()
                        onExit()
                    }) { Text("Exit") }
                },
            )
        },
    ) { padding ->
        when (recordState.status) {
            RecordStatus.IDLE ->
                BackgroundLocationChecklist(
                    modifier = Modifier.padding(padding),
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
                    modifier = Modifier.padding(padding),
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
                    modifier = Modifier.padding(padding),
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
    modifier: Modifier = Modifier,
    onPauseResume: () -> Unit,
    onFinish: () -> Unit,
) {
    val points = remember(recordState.rawPoints) { liveRidePoints(recordState) }
    val avgSpeedMps = if (recordState.elapsedSec > 10) recordState.distanceM / recordState.elapsedSec else null
    // Same follow/recenter pattern as NavScreen's map — see RouteMapView.kt.
    var followSuspended by remember { mutableStateOf(false) }
    var recenterRequests by remember { mutableStateOf(0) }

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Box(modifier = Modifier.fillMaxWidth().height(260.dp)) {
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
            if (followSuspended) {
                Button(
                    onClick = { recenterRequests++ },
                    modifier = Modifier.align(Alignment.BottomEnd).padding(12.dp),
                ) {
                    Text("Recenter")
                }
            }
        }

        Column(modifier = Modifier.padding(16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                Stat("Elapsed", formatDuration(recordState.elapsedSec))
                Stat("Distance", formatDistance(recordState.distanceM))
            }
            Row(modifier = Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                Stat("Speed", recordState.currentSpeedMps?.let { "${formatSpeed(it)} km/h" } ?: "—")
                Stat("Avg speed", avgSpeedMps?.let { "${formatSpeed(it)} km/h" } ?: "—")
            }
            Stat("Elevation gain", formatElevation(recordState.ascentM), modifier = Modifier.padding(top = 12.dp))

            Row(modifier = Modifier.padding(top = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (recordState.status == RecordStatus.RECORDING) {
                    OutlinedButton(onClick = onPauseResume, modifier = Modifier.weight(1f)) { Text("Pause") }
                } else {
                    Button(onClick = onPauseResume, modifier = Modifier.weight(1f)) { Text("Resume") }
                }
                Button(
                    onClick = onFinish,
                    enabled = recordState.rawPoints.size >= 2,
                    modifier = Modifier.weight(1f),
                ) { Text("Finish") }
            }

            if (points.size > 1) {
                Text(
                    "Elevation",
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(top = 20.dp),
                )
                ElevationProfile(points = points, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}

@Composable
private fun RecordStoppedContent(
    recordState: RecordUiState,
    modifier: Modifier = Modifier,
    name: String,
    onNameChange: (String) -> Unit,
    isSaving: Boolean,
    saveError: String?,
    onDiscard: () -> Unit,
    onSave: () -> Unit,
) {
    val points = remember(recordState.rawPoints) { liveRidePoints(recordState) }

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text(
            "${formatDistance(recordState.distanceM)} · ${formatElevation(recordState.ascentM)} ascent · ${formatDuration(recordState.elapsedSec)}",
            style = MaterialTheme.typography.titleMedium,
        )

        OutlinedTextField(
            value = name,
            onValueChange = onNameChange,
            label = { Text("Ride name") },
            placeholder = { Text("Ride — ${DateFormat.getDateInstance().format(Date())}") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        )

        saveError?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
        }

        Row(modifier = Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onDiscard, enabled = !isSaving, modifier = Modifier.weight(1f)) { Text("Discard") }
            Button(
                onClick = onSave,
                enabled = !isSaving && recordState.rawPoints.size >= 2,
                modifier = Modifier.weight(1f),
            ) {
                if (isSaving) CircularProgressIndicator(modifier = Modifier.size(18.dp)) else Text("Save ride")
            }
        }

        if (points.size > 1) {
            Text(
                "Elevation",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 20.dp),
            )
            ElevationProfile(points = points, modifier = Modifier.padding(top = 8.dp))
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
        Text(label, style = MaterialTheme.typography.labelSmall)
        Text(value, style = MaterialTheme.typography.titleLarge)
    }
}
