package com.hodora.app.ui.navigation

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hodora.app.data.model.Ride
import com.hodora.app.data.model.MeasurementUnit as HodoraUnit
import com.hodora.app.data.repository.PreferencesRepository
import com.hodora.app.data.repository.RideRepository
import com.hodora.app.data.tiles.MapTheme
import com.hodora.app.data.tiles.TileCacheServer
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

@HiltViewModel
class NavViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    repository: RideRepository,
    preferences: PreferencesRepository,
    private val tileCacheServer: TileCacheServer,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    val rideId: String = checkNotNull(savedStateHandle["rideId"])

    val ride: StateFlow<Ride?> = repository.observeRide(rideId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val unit: StateFlow<HodoraUnit> = preferences.unit
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HodoraUnit.METRIC)

    val navState: StateFlow<NavServiceState?> = NavigationService.state

    fun tileUrlTemplate(isDark: Boolean): String =
        tileCacheServer.tileUrlTemplate(if (isDark) MapTheme.DARK else MapTheme.LIGHT)

    fun startNavigation() {
        NavigationService.start(context, rideId)
    }

    fun stopNavigation() {
        NavigationService.stop(context)
    }
}
