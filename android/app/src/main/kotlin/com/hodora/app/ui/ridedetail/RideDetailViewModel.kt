package com.hodora.app.ui.ridedetail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hodora.app.data.model.Ride
import com.hodora.app.data.model.MeasurementUnit as HodoraUnit
import com.hodora.app.data.repository.PreferencesRepository
import com.hodora.app.data.repository.RideRepository
import com.hodora.app.data.tiles.MapTheme
import com.hodora.app.data.tiles.TileCacheServer
import com.hodora.app.data.tiles.TileDownloader
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class RideDetailUiState(
    val ride: Ride? = null,
    val unit: HodoraUnit = HodoraUnit.METRIC,
    val isSavedOffline: Boolean = false,
    val offlineEstimateMb: Double = 0.0,
    val downloadProgress: Float? = null,
)

@HiltViewModel
class RideDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: RideRepository,
    private val preferences: PreferencesRepository,
    private val tileDownloader: TileDownloader,
    private val tileCacheServer: TileCacheServer,
) : ViewModel() {

    private val rideId: String = checkNotNull(savedStateHandle["rideId"])
    private val isSavedOffline = MutableStateFlow(false)
    private val downloadProgress = MutableStateFlow<Float?>(null)

    val uiState: StateFlow<RideDetailUiState> = combine(
        repository.observeRide(rideId),
        preferences.unit,
        isSavedOffline,
        downloadProgress,
    ) { ride, unit, offline, progress ->
        RideDetailUiState(
            ride = ride,
            unit = unit,
            isSavedOffline = offline,
            offlineEstimateMb = ride?.let { tileDownloader.estimateSizeMb(it.points) } ?: 0.0,
            downloadProgress = progress,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), RideDetailUiState())

    init {
        viewModelScope.launch { refreshOfflineStatus() }
    }

    fun tileUrlTemplate(isDark: Boolean): String =
        tileCacheServer.tileUrlTemplate(if (isDark) MapTheme.DARK else MapTheme.LIGHT)

    fun downloadOffline() {
        val ride = uiState.value.ride ?: return
        viewModelScope.launch {
            downloadProgress.value = 0f
            tileDownloader.downloadRouteTiles(ride.points) { downloaded, total ->
                downloadProgress.value = if (total > 0) downloaded.toFloat() / total else 1f
            }
            downloadProgress.value = null
            refreshOfflineStatus()
        }
    }

    fun removeOffline() {
        val ride = uiState.value.ride ?: return
        viewModelScope.launch {
            tileDownloader.removeRouteTiles(ride.points)
            refreshOfflineStatus()
        }
    }

    private suspend fun refreshOfflineStatus() {
        val ride = repository.getRide(rideId) ?: return
        isSavedOffline.value = tileDownloader.isRouteMapSaved(ride.points)
    }
}
