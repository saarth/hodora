package app.hodora.mobile.ui.rides

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.hodora.mobile.data.model.RideSummary
import app.hodora.mobile.data.repository.RidesRepository
import app.hodora.mobile.gpx.parseGpx
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class RidesUiState(
    val rides: List<RideSummary> = emptyList(),
    val isLoading: Boolean = false,
    val isImporting: Boolean = false,
    val error: String? = null,
)

class RidesViewModel(
    private val repository: RidesRepository = RidesRepository(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(RidesUiState())
    val uiState: StateFlow<RidesUiState> = _uiState.asStateFlow()

    fun refresh() {
        _uiState.value = _uiState.value.copy(isLoading = true, error = null)
        viewModelScope.launch {
            try {
                val rides = repository.listRides()
                _uiState.value = _uiState.value.copy(rides = rides, isLoading = false)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = e.message ?: "Couldn't load rides")
            }
        }
    }

    /** Parses [xml] (already read off the picked document URI) and saves it as a new ride. */
    fun importGpx(
        xml: String,
        fallbackName: String,
        sourceFilename: String?,
        onImported: (rideId: String) -> Unit,
    ) {
        _uiState.value = _uiState.value.copy(isImporting = true, error = null)
        viewModelScope.launch {
            try {
                val parsed = parseGpx(xml, fallbackName)
                val id = repository.createRide(parsed, sourceFilename)
                _uiState.value = _uiState.value.copy(isImporting = false)
                onImported(id)
                refresh()
            } catch (e: Exception) {
                _uiState.value =
                    _uiState.value.copy(isImporting = false, error = e.message ?: "Couldn't import that GPX file")
            }
        }
    }
}
