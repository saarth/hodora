package app.hodora.mobile.ui.ridedetail

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.Navigation
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.hodora.mobile.data.model.Ride
import app.hodora.mobile.gpx.Bounds
import app.hodora.mobile.gpx.formatDistance
import app.hodora.mobile.gpx.formatElevation
import app.hodora.mobile.gpx.toGpx
import app.hodora.mobile.ui.components.Caption
import app.hodora.mobile.ui.components.HodoraButton
import app.hodora.mobile.ui.components.HodoraButtonVariant
import app.hodora.mobile.ui.components.HodoraCard
import app.hodora.mobile.ui.components.HodoraChip
import app.hodora.mobile.ui.components.StatFigure
import app.hodora.mobile.ui.map.RouteMapView
import app.hodora.mobile.ui.theme.LocalHodoraColors
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
    val dark = isSystemInDarkTheme()
    val colors = LocalHodoraColors.current

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

    Scaffold(containerColor = colors.bg, contentWindowInsets = WindowInsets(0, 0, 0, 0)) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                state.isLoading ->
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = colors.primary)
                    }

                state.error != null ->
                    Box(modifier = Modifier.fillMaxSize().padding(24.dp)) {
                        Text(state.error.orEmpty(), color = colors.ink)
                    }

                state.ride != null ->
                    RideDetailContent(
                        ride = state.ride!!,
                        onNavigate = onNavigate,
                        onBack = onBack,
                        onExport = { exportLauncher.launch("${state.ride!!.name}.gpx") },
                        isSavedOffline = state.isSavedOffline,
                        isSavingOffline = state.isSavingOffline,
                        tileProgress = state.tileProgress,
                        offlineError = state.offlineError,
                        onSaveOffline = { viewModel.saveForOffline(context, dark) },
                        onRemoveOffline = { viewModel.removeOffline(context) },
                    )
            }
        }
    }
}

@Composable
private fun RideDetailContent(
    ride: Ride,
    onNavigate: () -> Unit,
    onBack: () -> Unit,
    onExport: () -> Unit,
    isSavedOffline: Boolean,
    isSavingOffline: Boolean,
    tileProgress: Float?,
    offlineError: String?,
    onSaveOffline: () -> Unit,
    onRemoveOffline: () -> Unit,
) {
    val colors = LocalHodoraColors.current
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Box {
            Box(
                modifier =
                    Modifier.fillMaxWidth().height(280.dp).background(
                        Brush.radialGradient(
                            colors = listOf(colors.primary.copy(alpha = 0.14f), colors.bg.copy(alpha = 0f)),
                            radius = 900f,
                        ),
                    ).background(Brush.verticalGradient(colors = listOf(colors.elevated, colors.bg))),
            ) {
                RouteMapView(
                    points = ride.points,
                    bounds = ride.bounds(),
                    modifier = Modifier.fillMaxWidth().height(280.dp).clip(RectangleShape),
                )
            }
            Box(modifier = Modifier.fillMaxWidth().padding(top = 52.dp, start = 16.dp, end = 16.dp)) {
                Box(
                    modifier =
                        Modifier
                            .align(Alignment.CenterStart)
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(colors.card.copy(alpha = 0.88f))
                            .clickable(onClick = onBack),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Outlined.ArrowBack, contentDescription = "Back", tint = colors.ink)
                }
                HodoraChip(onClick = onExport, modifier = Modifier.align(Alignment.CenterEnd)) {
                    Icon(Icons.Outlined.FileDownload, contentDescription = null, tint = colors.ink, modifier = Modifier.size(16.dp))
                    Text("Export", color = colors.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }

        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                text = ride.name,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = colors.ink,
            )

            Row(modifier = Modifier.padding(top = 20.dp)) {
                Column(modifier = Modifier.padding(end = 28.dp)) {
                    Caption("Distance")
                    StatFigure(text = formatDistance(ride.distanceM), fontSize = 26.sp)
                }
                Column {
                    Caption("Ascent")
                    StatFigure(text = formatElevation(ride.ascentM), fontSize = 26.sp)
                }
            }

            ride.description?.let { description ->
                Text(
                    text = description,
                    color = colors.mutedInk,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }

            HodoraButton(
                text = "Start navigation",
                onClick = onNavigate,
                enabled = ride.points.size >= 2,
                modifier = Modifier.padding(top = 20.dp),
                icon = { Icon(Icons.Outlined.Navigation, contentDescription = null, modifier = Modifier.size(18.dp)) },
            )

            when {
                isSavingOffline ->
                    Column(modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
                        Text("Saving for offline…", color = colors.mutedInk, fontSize = 13.sp)
                        LinearProgressIndicator(
                            progress = { tileProgress ?: 0f },
                            color = colors.primary,
                            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        )
                    }
                isSavedOffline ->
                    HodoraButton(
                        text = "Saved offline — remove",
                        onClick = onRemoveOffline,
                        variant = HodoraButtonVariant.Outline,
                        height = 48.dp,
                        modifier = Modifier.padding(top = 10.dp),
                        icon = { Icon(Icons.Outlined.CloudDone, contentDescription = null, modifier = Modifier.size(17.dp)) },
                    )
                else ->
                    HodoraButton(
                        text = "Save for offline",
                        onClick = onSaveOffline,
                        enabled = ride.points.size >= 2,
                        variant = HodoraButtonVariant.Outline,
                        height = 48.dp,
                        modifier = Modifier.padding(top = 10.dp),
                        icon = { Icon(Icons.Outlined.CloudOff, contentDescription = null, modifier = Modifier.size(17.dp)) },
                    )
            }
            offlineError?.let {
                Text(
                    text = it,
                    color = colors.destructive,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }

            HodoraCard(modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Caption("Elevation")
                    ElevationProfile(points = ride.points, modifier = Modifier.padding(top = 8.dp))
                }
            }
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
