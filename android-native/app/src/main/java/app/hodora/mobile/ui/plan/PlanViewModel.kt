package app.hodora.mobile.ui.plan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.hodora.mobile.data.repository.RidesRepository
import app.hodora.mobile.gpx.ParsedRide
import app.hodora.mobile.gpx.computeAscentDescent
import app.hodora.mobile.routing.BikeProfile
import app.hodora.mobile.routing.LatLon
import app.hodora.mobile.routing.RoutedPath
import app.hodora.mobile.routing.boundsOf
import app.hodora.mobile.routing.fetchRoute
import app.hodora.mobile.routing.toRidePoints
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PlanUiState(
    val waypoints: List<LatLon> = emptyList(),
    val profile: BikeProfile = BikeProfile.TREKKING,
    val routed: RoutedPath? = null,
    val isRouting: Boolean = false,
    val name: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
)

/** Port of the waypoints/routing/save logic in src/routes/plan.tsx — the tap-to-plan behavior, not its weather-at-departure panel (that needs weather.ts, a later phase). */
class PlanViewModel(
    private val repository: RidesRepository = RidesRepository(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(PlanUiState())
    val uiState: StateFlow<PlanUiState> = _uiState.asStateFlow()

    private var routingJob: Job? = null

    fun addWaypoint(point: LatLon) {
        _uiState.value = _uiState.value.copy(waypoints = _uiState.value.waypoints + point, error = null)
        reroute()
    }

    fun undoWaypoint() {
        val current = _uiState.value.waypoints
        if (current.isEmpty()) return
        _uiState.value = _uiState.value.copy(waypoints = current.dropLast(1))
        reroute()
    }

    fun clearWaypoints() {
        routingJob?.cancel()
        _uiState.value = _uiState.value.copy(waypoints = emptyList(), routed = null, isRouting = false)
    }

    fun setProfile(profile: BikeProfile) {
        _uiState.value = _uiState.value.copy(profile = profile)
        reroute()
    }

    fun setName(name: String) {
        _uiState.value = _uiState.value.copy(name = name)
    }

    /** Re-routes through every waypoint whenever they (or the profile) change — same trigger as the web's effect, minus the debounce (neither has one). */
    private fun reroute() {
        routingJob?.cancel()
        val state = _uiState.value
        if (state.waypoints.size < 2) {
            _uiState.value = state.copy(routed = null, isRouting = false)
            return
        }
        _uiState.value = state.copy(isRouting = true)
        routingJob =
            viewModelScope.launch {
                val result = fetchRoute(state.waypoints, profile = state.profile, preferBrouter = true)
                _uiState.value = _uiState.value.copy(routed = result, isRouting = false)
            }
    }

    fun save(onSaved: (rideId: String) -> Unit) {
        val state = _uiState.value
        val routed = state.routed
        if (routed == null || routed.path.size < 2) {
            _uiState.value = state.copy(error = "Add at least two points first")
            return
        }
        _uiState.value = state.copy(isSaving = true, error = null)
        viewModelScope.launch {
            try {
                val ridePoints = toRidePoints(routed.path)
                val (ascentM, descentM) = computeAscentDescent(ridePoints)
                val parsed =
                    ParsedRide(
                        name = state.name.trim().ifEmpty { "Planned route" },
                        points = ridePoints,
                        distanceM = routed.distanceM,
                        ascentM = ascentM,
                        descentM = descentM,
                        bounds = boundsOf(routed.path),
                    )
                val id =
                    repository.createRide(
                        parsed = parsed,
                        cues = routed.cues,
                        planWaypoints = state.waypoints,
                        planProfile = state.profile,
                    )
                _uiState.value = _uiState.value.copy(isSaving = false)
                onSaved(id)
            } catch (e: Exception) {
                _uiState.value =
                    _uiState.value.copy(isSaving = false, error = e.message ?: "Could not save that route")
            }
        }
    }
}
