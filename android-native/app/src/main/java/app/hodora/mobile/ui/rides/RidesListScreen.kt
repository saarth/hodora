package app.hodora.mobile.ui.rides

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.hodora.mobile.data.model.RideSummary
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RidesListScreen(
    onSignOut: () -> Unit,
    viewModel: RidesViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) { viewModel.refresh() }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Your rides") },
                actions = {
                    TextButton(onClick = onSignOut) { Text("Sign out") }
                },
            )
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
                ) { Text("No rides yet — import a GPX from the Hodora web app to see it here.") }

            else ->
                LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                    items(state.rides, key = { it.id }) { ride -> RideRow(ride) }
                }
        }
    }
}

@Composable
private fun RideRow(ride: RideSummary) {
    ListItem(
        headlineContent = { Text(ride.name) },
        supportingContent = {
            val km = ride.distanceM / 1000
            Text(String.format(Locale.getDefault(), "%.1f km · %d m ascent", km, ride.ascentM.toInt()))
        },
    )
}
