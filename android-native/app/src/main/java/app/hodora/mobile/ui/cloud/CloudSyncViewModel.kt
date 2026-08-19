package app.hodora.mobile.ui.cloud

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.hodora.mobile.data.repository.CloudProvider
import app.hodora.mobile.data.repository.CloudStatus
import app.hodora.mobile.data.repository.CloudSyncRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class CloudSyncUiState(
    val googleDrive: CloudStatus? = null,
    val oneDrive: CloudStatus? = null,
    val nextcloud: CloudStatus? = null,
    val isLoading: Boolean = true,
    val isConnecting: Boolean = false,
    val error: String? = null,
)

class CloudSyncViewModel(
    private val repository: CloudSyncRepository = CloudSyncRepository(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(CloudSyncUiState())
    val uiState: StateFlow<CloudSyncUiState> = _uiState.asStateFlow()

    fun refresh() {
        _uiState.value = _uiState.value.copy(isLoading = true, error = null)
        viewModelScope.launch {
            try {
                val googleDrive = repository.status(CloudProvider.GOOGLE_DRIVE)
                val oneDrive = repository.status(CloudProvider.ONEDRIVE)
                val nextcloud = repository.nextcloudStatus()
                _uiState.value =
                    _uiState.value.copy(googleDrive = googleDrive, oneDrive = oneDrive, nextcloud = nextcloud, isLoading = false)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = e.message ?: "Couldn't load cloud sync status")
            }
        }
    }

    /** Fetches the OAuth consent URL, then hands it to [onOpenUrl] (the screen opens it in a browser — see CloudSyncRepository's doc comment for why there's no in-app return yet). */
    fun connect(
        provider: CloudProvider,
        onOpenUrl: (String) -> Unit,
    ) {
        _uiState.value = _uiState.value.copy(isConnecting = true, error = null)
        viewModelScope.launch {
            try {
                val url = repository.authorizeUrl(provider)
                _uiState.value = _uiState.value.copy(isConnecting = false)
                onOpenUrl(url)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isConnecting = false, error = e.message ?: "Could not start sign-in")
            }
        }
    }

    fun disconnect(provider: CloudProvider) {
        viewModelScope.launch {
            try {
                repository.disconnect(provider)
                refresh()
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Could not disconnect")
            }
        }
    }

    fun connectNextcloud(
        serverUrl: String,
        username: String,
        appPassword: String,
    ) {
        _uiState.value = _uiState.value.copy(isConnecting = true, error = null)
        viewModelScope.launch {
            try {
                repository.connectNextcloud(serverUrl, username, appPassword)
                _uiState.value = _uiState.value.copy(isConnecting = false)
                refresh()
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isConnecting = false, error = e.message ?: "Could not connect to Nextcloud")
            }
        }
    }

    fun disconnectNextcloud() {
        viewModelScope.launch {
            try {
                repository.disconnectNextcloud()
                refresh()
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Could not disconnect")
            }
        }
    }
}
