package app.hodora.mobile.ui.rides

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.hodora.mobile.data.model.RideSummary
import app.hodora.mobile.data.repository.RidesRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class RidesUiState(
    val rides: List<RideSummary> = emptyList(),
    val isLoading: Boolean = false,
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
                _uiState.value = RidesUiState(rides = rides)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = e.message ?: "Couldn't load rides")
            }
        }
    }
}
