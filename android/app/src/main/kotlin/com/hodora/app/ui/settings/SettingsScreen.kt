package com.hodora.app.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hodora.app.data.model.MeasurementUnit as HodoraUnit

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val unit by viewModel.unit.collectAsStateWithLifecycle()
    val darkOverride by viewModel.darkThemeOverride.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).padding(16.dp)) {
            Text("Units", style = MaterialTheme.typography.titleMedium)
            RadioRow("Metric (km, m)", unit == HodoraUnit.METRIC) { viewModel.setUnit(HodoraUnit.METRIC) }
            RadioRow("Imperial (mi, ft)", unit == HodoraUnit.IMPERIAL) { viewModel.setUnit(HodoraUnit.IMPERIAL) }

            Text("Theme", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 24.dp))
            RadioRow("Follow system", darkOverride == null) { viewModel.setDarkThemeOverride(null) }
            RadioRow("Light", darkOverride == false) { viewModel.setDarkThemeOverride(false) }
            RadioRow("Dark", darkOverride == true) { viewModel.setDarkThemeOverride(true) }
        }
    }
}

@Composable
private fun RadioRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .selectable(selected = selected, onClick = onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = onClick)
        Text(label, modifier = Modifier.padding(start = 8.dp))
    }
}
