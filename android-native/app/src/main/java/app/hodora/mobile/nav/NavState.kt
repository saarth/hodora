package app.hodora.mobile.nav

import app.hodora.mobile.cues.CueSheetEntry
import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.routing.LatLon
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class NavPosition(val lat: Double, val lon: Double, val headingDeg: Double?)

data class NavUiState(
    val rideId: String? = null,
    val rideName: String = "",
    val routePoints: List<RidePoint> = emptyList(),
    val isRunning: Boolean = false,
    val isFinished: Boolean = false,
    val position: NavPosition? = null,
    val snap: Snap? = null,
    val distanceRemainingM: Double = 0.0,
    val totalDistanceM: Double = 0.0,
    val nextCue: CueSheetEntry? = null,
    val nextCueDistanceM: Double = 0.0,
    val offRoute: Boolean = false,
    /** Bike-friendly path back to the track while off-route — port of rejoin.ts's useRejoinRoute, run inside NavigationService instead of a Compose hook. Empty when on-route. */
    val rejoinPath: List<LatLon> = emptyList(),
    /** true when rejoinPath came from a real router; false for the straight-line fallback (or before the first fetch resolves). */
    val rejoinRouted: Boolean = false,
    val rejoinLoading: Boolean = false,
    val rejoinDistanceM: Double = 0.0,
    val voiceEnabled: Boolean = false,
    val error: String? = null,
)

/**
 * Shared state between NavigationService (the source of truth, running in
 * the background even when no UI is attached) and NavScreen (which just
 * observes it) — a plain singleton StateFlow rather than a bound-service/
 * Messenger setup, since everything runs in one process and there's exactly
 * one navigation session at a time.
 */
object NavState {
    private val _uiState = MutableStateFlow(NavUiState())
    val uiState: StateFlow<NavUiState> = _uiState.asStateFlow()

    fun update(transform: (NavUiState) -> NavUiState) {
        _uiState.value = transform(_uiState.value)
    }

    fun reset() {
        _uiState.value = NavUiState()
    }
}
