package app.hodora.mobile.ui.ridedetail

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.hodora.mobile.data.model.Ride
import app.hodora.mobile.data.repository.RidesRepository
import app.hodora.mobile.offline.RegionDownloadProgress
import app.hodora.mobile.offline.downloadRouteRegion
import app.hodora.mobile.offline.removeRouteRegion
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class RideDetailUiState(
    val ride: Ride? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
    val isSavedOffline: Boolean = false,
    /** 0f..1f while a tile download is in progress; null otherwise. */
    val tileProgress: Float? = null,
    val offlineError: String? = null,
) {
    val isSavingOffline: Boolean get() = tileProgress != null
}

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
                val savedOffline = repository.isRideSavedOffline(rideId)
                _uiState.value = RideDetailUiState(ride = ride, isLoading = false, isSavedOffline = savedOffline)
            } catch (e: Exception) {
                _uiState.value =
                    _uiState.value.copy(isLoading = false, error = e.message ?: "Couldn't load this ride")
            }
        }
    }

    /**
     * Saves the ride itself (Room, via RidesRepository) and downloads its
     * basemap tiles (MapLibre's OfflineManager, see offline/OfflineMaps.kt)
     * so both the route and the map render with no network at all.
     * [context] is used only transiently for this one call, not retained.
     */
    fun saveForOffline(
        context: Context,
        dark: Boolean,
    ) {
        val ride = _uiState.value.ride ?: return
        if (_uiState.value.isSavingOffline) return
        _uiState.value = _uiState.value.copy(tileProgress = 0f, offlineError = null)
        viewModelScope.launch {
            try {
                repository.saveRideOffline(ride)
                downloadRouteRegion(context.applicationContext, ride.id, ride.points, dark).collect { progress ->
                    _uiState.value =
                        when (progress) {
                            is RegionDownloadProgress.InProgress -> {
                                val fraction = if (progress.required > 0) progress.completed.toFloat() / progress.required else 0f
                                _uiState.value.copy(tileProgress = fraction)
                            }
                            RegionDownloadProgress.Complete ->
                                _uiState.value.copy(tileProgress = null, isSavedOffline = true)
                            is RegionDownloadProgress.Error ->
                                _uiState.value.copy(tileProgress = null, offlineError = progress.message)
                        }
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(tileProgress = null, offlineError = e.message ?: "Couldn't save for offline")
            }
        }
    }

    fun removeOffline(context: Context) {
        val ride = _uiState.value.ride ?: return
        viewModelScope.launch {
            repository.removeOfflineRide(ride.id)
            removeRouteRegion(context.applicationContext, ride.id)
            _uiState.value = _uiState.value.copy(isSavedOffline = false)
        }
    }
}
