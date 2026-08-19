package app.hodora.mobile.ui.rides

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.hodora.mobile.data.model.RideSummary
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
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Your rides") },
                actions = {
                    TextButton(onClick = onRecordRide) { Text("Record") }
                    TextButton(onClick = onPlanRoute) { Text("Plan") }
                    Box {
                        TextButton(onClick = { moreMenuExpanded = true }) { Text("More") }
                        DropdownMenu(expanded = moreMenuExpanded, onDismissRequest = { moreMenuExpanded = false }) {
                            DropdownMenuItem(text = { Text("Explore") }, onClick = { moreMenuExpanded = false; onExplore() })
                            DropdownMenuItem(text = { Text("Wind") }, onClick = { moreMenuExpanded = false; onWind() })
                            DropdownMenuItem(text = { Text("Cloud sync") }, onClick = { moreMenuExpanded = false; onCloudSync() })
                            DropdownMenuItem(text = { Text("Sign out") }, onClick = { moreMenuExpanded = false; onSignOut() })
                        }
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { importLauncher.launch(arrayOf("*/*")) }) {
                Text(if (state.isImporting) "…" else "+")
            }
        },
    ) { padding ->
        when {
            state.isLoading ->
                Column(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) { CircularProgressIndicator() }

            state.error != null ->
                Column(
                    modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                ) { Text(state.error.orEmpty()) }

            state.rides.isEmpty() ->
                Column(
                    modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) { Text("No rides yet — tap + to import a GPX file.") }

            else ->
                LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                    items(state.rides, key = { it.id }) { ride -> RideRow(ride, onClick = { onOpenRide(ride.id) }) }
                }
        }
    }
}

@Composable
private fun RideRow(
    ride: RideSummary,
    onClick: () -> Unit,
) {
    ListItem(
        modifier = Modifier.clickable(onClick = onClick),
        headlineContent = { Text(ride.name) },
        supportingContent = {
            val km = ride.distanceM / 1000
            Text(String.format(Locale.getDefault(), "%.1f km · %d m ascent", km, ride.ascentM.toInt()))
        },
    )
}

private fun queryDisplayName(
    context: Context,
    uri: Uri,
): String? =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
    }
