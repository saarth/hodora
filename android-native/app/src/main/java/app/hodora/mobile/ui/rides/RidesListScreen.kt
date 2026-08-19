package app.hodora.mobile.ui.rides

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.ShowChart
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Route
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.hodora.mobile.data.model.RideSummary
import app.hodora.mobile.ui.components.HodoraCard
import app.hodora.mobile.ui.components.StatFigure
import app.hodora.mobile.ui.theme.LocalHodoraColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RidesListScreen(
    onSignOut: () -> Unit,
    onOpenRide: (rideId: String) -> Unit,
    onPlanRoute: () -> Unit,
    onRecordRide: () -> Unit,
    onExplore: () -> Unit,
    onWind: () -> Unit,
    onCloudSync: () -> Unit,
    viewModel: RidesViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var moreMenuExpanded by remember { mutableStateOf(false) }
    val colors = LocalHodoraColors.current

    LaunchedEffect(Unit) { viewModel.refresh() }

    // "*/*" rather than a GPX-specific mime type: most Android file pickers
    // and cloud providers report .gpx files as application/octet-stream (or
    // nothing at all), so filtering by mime type would hide the very files
    // riders want to pick.
    val importLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            if (uri == null) return@rememberLauncherForActivityResult
            scope.launch(Dispatchers.IO) {
                val displayName = queryDisplayName(context, uri) ?: "Imported ride"
                val xml =
                    context.contentResolver.openInputStream(uri)?.use { stream ->
                        stream.readBytes().toString(Charsets.UTF_8)
                    }
                if (xml != null) {
                    viewModel.importGpx(
                        xml = xml,
                        fallbackName = displayName.removeSuffix(".gpx"),
                        sourceFilename = displayName,
                        onImported = onOpenRide,
                    )
                }
            }
        }

    Scaffold(
        containerColor = colors.bg,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 24.dp, bottom = 12.dp),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = "Your rides",
                        fontSize = 30.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.ink,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TopIconButton(icon = Icons.Outlined.Circle, contentDescription = "Record a ride", onClick = onRecordRide)
                        TopIconButton(icon = Icons.Outlined.Route, contentDescription = "Plan a route", onClick = onPlanRoute)
                        Box {
                            TopIconButton(icon = Icons.Outlined.MoreHoriz, contentDescription = "More", onClick = { moreMenuExpanded = true })
                            DropdownMenu(expanded = moreMenuExpanded, onDismissRequest = { moreMenuExpanded = false }) {
                                DropdownMenuItem(text = { Text("Explore") }, onClick = { moreMenuExpanded = false; onExplore() })
                                DropdownMenuItem(text = { Text("Wind") }, onClick = { moreMenuExpanded = false; onWind() })
                                DropdownMenuItem(text = { Text("Cloud sync") }, onClick = { moreMenuExpanded = false; onCloudSync() })
                                DropdownMenuItem(text = { Text("Sign out") }, onClick = { moreMenuExpanded = false; onSignOut() })
                            }
                        }
                    }
                }

                when {
                    state.isLoading ->
                        Column(
                            modifier = Modifier.fillMaxSize(),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) { CircularProgressIndicator(color = colors.primary) }

                    state.error != null ->
                        Column(
                            modifier = Modifier.fillMaxSize().padding(24.dp),
                            verticalArrangement = Arrangement.Center,
                        ) { Text(state.error.orEmpty(), color = colors.ink) }

                    state.rides.isEmpty() ->
                        Column(
                            modifier = Modifier.fillMaxSize().padding(24.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) { Text("No rides yet — tap + to import a GPX file.", color = colors.mutedInk) }

                    else ->
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 100.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            items(state.rides, key = { it.id }) { ride -> RideRow(ride, onClick = { onOpenRide(ride.id) }) }
                        }
                }
            }

            Box(
                modifier =
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 20.dp, bottom = 28.dp)
                        .size(56.dp)
                        .shadow(
                            elevation = 16.dp,
                            shape = RoundedCornerShape(18.dp),
                            ambientColor = colors.primary.copy(alpha = 0.35f),
                            spotColor = colors.primary.copy(alpha = 0.35f),
                        )
                        .clip(RoundedCornerShape(18.dp))
                        .background(colors.primary)
                        .clickable { importLauncher.launch(arrayOf("*/*")) },
                contentAlignment = Alignment.Center,
            ) {
                if (state.isImporting) {
                    CircularProgressIndicator(color = colors.primaryInk, modifier = Modifier.size(24.dp))
                } else {
                    Icon(Icons.Outlined.Add, contentDescription = "Import a GPX file", tint = colors.primaryInk)
                }
            }
        }
    }
}

@Composable
private fun TopIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
) {
    val colors = LocalHodoraColors.current
    Box(
        modifier =
            Modifier
                .size(40.dp)
                .clip(CircleShape)
                .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = colors.ink)
    }
}

@Composable
private fun RideRow(
    ride: RideSummary,
    onClick: () -> Unit,
) {
    val colors = LocalHodoraColors.current
    HodoraCard(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier =
                    Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(colors.accent),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Outlined.ShowChart,
                    contentDescription = null,
                    tint = colors.rust,
                    modifier = Modifier.size(22.dp),
                )
            }
            Column(modifier = Modifier.weight(1f).padding(start = 14.dp, end = 8.dp)) {
                Text(
                    text = ride.name,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.ink,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                val km = ride.distanceM / 1000
                StatFigure(
                    text = String.format(Locale.getDefault(), "%.1f km · %d m ascent", km, ride.ascentM.toInt()),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Normal,
                    color = colors.mutedInk,
                    modifier = Modifier.padding(top = 3.dp),
                )
            }
            Icon(
                Icons.Outlined.KeyboardArrowRight,
                contentDescription = null,
                tint = colors.mutedInk,
            )
        }
    }
}

private fun queryDisplayName(
    context: Context,
    uri: Uri,
): String? =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
    }
