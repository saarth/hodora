package app.hodora.mobile.ui.explore

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.hodora.mobile.data.repository.RidesRepository
import app.hodora.mobile.discover.DiscoveredRoute
import app.hodora.mobile.discover.findNearbyRoutes
import app.hodora.mobile.discover.generateLoops
import app.hodora.mobile.gpx.ParsedRide
import app.hodora.mobile.gpx.computeAscentDescent
import app.hodora.mobile.routing.LatLon
import app.hodora.mobile.routing.boundsOf
import app.hodora.mobile.routing.toRidePoints
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Zurich — same arbitrary fallback the web version uses (explore.tsx's FALLBACK_CENTER) until a real location is available. */
private val FALLBACK_CENTER = LatLon(47.3769, 8.5417)

data class ExploreUiState(
    val center: LatLon = FALLBACK_CENTER,
    val radiusKm: Int = 15,
    val loopKm: Int = 40,
    val routes: List<DiscoveredRoute> = emptyList(),
    val selectedId: String? = null,
    val isSearching: Boolean = false,
    val searchedOnce: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
)

/**
 * Port of explore.tsx's search/save orchestration (discover.ts itself is
 * ported at discover/Discover.kt). Not ported: place search / typing an
 * address to explore (PlaceSearch.tsx, a separate geocoding integration) —
 * "My location" plus panning to search elsewhere covers the core loop.
 */
class ExploreViewModel(
    private val repository: RidesRepository = RidesRepository(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(ExploreUiState())
    val uiState: StateFlow<ExploreUiState> = _uiState.asStateFlow()
    private var searchJob: Job? = null

    fun setCenter(center: LatLon) {
        _uiState.value = _uiState.value.copy(center = center)
    }

    fun setRadiusKm(km: Int) {
        _uiState.value = _uiState.value.copy(radiusKm = km)
    }

    fun setLoopKm(km: Int) {
        _uiState.value = _uiState.value.copy(loopKm = km)
    }

    fun select(id: String) {
        _uiState.value = _uiState.value.copy(selectedId = id)
    }

    fun search() {
        searchJob?.cancel()
        val state = _uiState.value
        _uiState.value = state.copy(isSearching = true, searchedOnce = true, error = null)
        searchJob =
            viewModelScope.launch {
                val nearbyDeferred = async { runCatching { findNearbyRoutes(state.center, state.radiusKm * 1000.0) }.getOrDefault(emptyList()) }
                val loopsDeferred = async { runCatching { generateLoops(state.center, state.loopKm * 1000.0) }.getOrDefault(emptyList()) }
                val found = loopsDeferred.await() + nearbyDeferred.await()
                _uiState.value =
                    _uiState.value.copy(
                        routes = found,
                        selectedId = found.firstOrNull()?.id,
                        isSearching = false,
                        error = if (found.isEmpty()) "Nothing found here — try a wider area or another spot." else null,
                    )
            }
    }

    fun save(
        route: DiscoveredRoute,
        onSaved: (rideId: String) -> Unit,
    ) {
        if (_uiState.value.isSaving) return
        _uiState.value = _uiState.value.copy(isSaving = true)
        viewModelScope.launch {
            try {
                val points = toRidePoints(route.path)
                val (ascentM, descentM) = computeAscentDescent(points)
                val parsed =
                    ParsedRide(
                        name = route.name,
                        points = points,
                        distanceM = route.distanceM,
                        ascentM = ascentM,
                        descentM = descentM,
                        bounds = boundsOf(route.path),
                    )
                val id = repository.createRide(parsed)
                _uiState.value = _uiState.value.copy(isSaving = false)
                onSaved(id)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isSaving = false, error = e.message ?: "Could not save that route")
            }
        }
    }
}
