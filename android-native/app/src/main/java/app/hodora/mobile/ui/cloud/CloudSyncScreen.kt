package app.hodora.mobile.ui.cloud

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.hodora.mobile.data.repository.CloudProvider
import app.hodora.mobile.data.repository.CloudStatus

/**
 * Port of the cloud-sync section of /settings — connect/disconnect Google
 * Drive, OneDrive, and Nextcloud. See CloudSyncRepository's doc comment for
 * the OAuth-return caveat (Google Drive/OneDrive open the consent screen in
 * the system browser; there's no automatic return to the app yet).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CloudSyncScreen(
    onBack: () -> Unit,
    viewModel: CloudSyncViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) { viewModel.refresh() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Cloud sync") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp).verticalScroll(rememberScrollState())) {
            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 12.dp))
            }

            OAuthProviderCard(
                label = "Google Drive",
                status = state.googleDrive,
                isConnecting = state.isConnecting,
                onConnect = {
                    viewModel.connect(CloudProvider.GOOGLE_DRIVE) { url ->
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    }
                },
                onDisconnect = { viewModel.disconnect(CloudProvider.GOOGLE_DRIVE) },
            )
            OAuthProviderCard(
                label = "OneDrive",
                status = state.oneDrive,
                isConnecting = state.isConnecting,
                onConnect = {
                    viewModel.connect(CloudProvider.ONEDRIVE) { url ->
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    }
                },
                onDisconnect = { viewModel.disconnect(CloudProvider.ONEDRIVE) },
                modifier = Modifier.padding(top = 16.dp),
            )
            NextcloudCard(
                status = state.nextcloud,
                isConnecting = state.isConnecting,
                onConnect = { url, username, password -> viewModel.connectNextcloud(url, username, password) },
                onDisconnect = { viewModel.disconnectNextcloud() },
                modifier = Modifier.padding(top = 16.dp),
            )

            TextButton(onClick = { viewModel.refresh() }, modifier = Modifier.padding(top = 16.dp)) {
                if (state.isLoading) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp)) else Text("Refresh status")
            }
        }
    }
}

@Composable
private fun OAuthProviderCard(
    label: String,
    status: CloudStatus?,
    isConnecting: Boolean,
    onConnect: () -> Unit,
    onDisconnect: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(modifier = modifier.fillMaxWidth(), tonalElevation = 1.dp) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(label, style = MaterialTheme.typography.titleMedium)
            if (status?.connected == true) {
                Text(
                    status.accountLabel ?: "Connected",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 4.dp),
                )
                status.lastError?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                OutlinedButton(onClick = onDisconnect, modifier = Modifier.padding(top = 8.dp)) { Text("Disconnect") }
            } else {
                Button(onClick = onConnect, enabled = !isConnecting, modifier = Modifier.padding(top = 8.dp)) {
                    Text("Connect")
                }
            }
        }
    }
}

@Composable
private fun NextcloudCard(
    status: CloudStatus?,
    isConnecting: Boolean,
    onConnect: (serverUrl: String, username: String, appPassword: String) -> Unit,
    onDisconnect: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(modifier = modifier.fillMaxWidth(), tonalElevation = 1.dp) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Nextcloud", style = MaterialTheme.typography.titleMedium)
            if (status?.connected == true) {
                Text(
                    status.accountLabel ?: "Connected",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 4.dp),
                )
                status.lastError?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                OutlinedButton(onClick = onDisconnect, modifier = Modifier.padding(top = 8.dp)) { Text("Disconnect") }
            } else {
                var serverUrl by remember { mutableStateOf("") }
                var username by remember { mutableStateOf("") }
                var appPassword by remember { mutableStateOf("") }

                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    label = { Text("Server URL") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    label = { Text("Username") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                OutlinedTextField(
                    value = appPassword,
                    onValueChange = { appPassword = it },
                    label = { Text("App password") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                Button(
                    onClick = { onConnect(serverUrl.trim(), username.trim(), appPassword) },
                    enabled = !isConnecting && serverUrl.isNotBlank() && username.isNotBlank() && appPassword.isNotBlank(),
                    modifier = Modifier.padding(top = 8.dp),
                ) {
                    if (isConnecting) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp)) else Text("Connect")
                }
            }
        }
    }
}
