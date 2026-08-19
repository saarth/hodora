package app.hodora.mobile.ui.ridedetail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.hodora.mobile.data.model.Ride
import app.hodora.mobile.data.repository.RidesRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class RideDetailUiState(
    val ride: Ride? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
)

class RideDetailViewModel(
    private val rideId: String,
    private val repository: RidesRepository = RidesRepository(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(RideDetailUiState())
    val uiState: StateFlow<RideDetailUiState> = _uiState.asStateFlow()

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, error = null)
        viewModelScope.launch {
            try {
                val ride = repository.getRide(rideId)
                _uiState.value = RideDetailUiState(ride = ride, isLoading = false)
            } catch (e: Exception) {
                _uiState.value =
                    _uiState.value.copy(isLoading = false, error = e.message ?: "Couldn't load this ride")
            }
        }
    }
}
