package app.hodora.mobile.nav

import app.hodora.mobile.cues.CueSheetEntry
import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.routing.LatLon
import app.hodora.mobile.weather.RainAlert
import app.hodora.mobile.weather.WeatherFix
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class NavPosition(val lat: Double, val lon: Double, val headingDeg: Double?)

/** Live wind relative to the rider's direction of travel — port of the headwind/tailwind readout in src/routes/rides.$id.nav.tsx. */
data class NavWindInfo(val effect: WindEffect, val windSpeedMs: Double, val componentMs: Double)

/** A note the rider is passing right now — port of the proximity-alert toast in src/routes/rides.$id.nav.tsx. */
data class ProximityAlert(val noteId: String, val text: String)

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
    /** Current conditions at (roughly) the rider's position — refreshed on the same move/staleness throttle as useWeather on web. */
    val weather: WeatherFix? = null,
    val wind: NavWindInfo? = null,
    /** Set once when a new rain alert fires; NavScreen keys a one-shot snackbar off `rainAlert?.key` so the same alert never re-shows. */
    val rainAlert: RainAlert? = null,
    /** Set once when the rider passes a ride note; NavScreen keys a one-shot snackbar off `proximityAlert?.noteId`. */
    val proximityAlert: ProximityAlert? = null,
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
