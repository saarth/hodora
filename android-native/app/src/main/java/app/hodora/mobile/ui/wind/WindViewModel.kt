package app.hodora.mobile.ui.wind

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.hodora.mobile.data.model.Ride
import app.hodora.mobile.data.model.RideSummary
import app.hodora.mobile.data.repository.RidesRepository
import app.hodora.mobile.weather.WeatherFix
import app.hodora.mobile.weather.fetchWeather
import app.hodora.mobile.wind.WindSample
import app.hodora.mobile.wind.WindScoreResult
import app.hodora.mobile.wind.scoreRoute
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class WindUiState(
    val summaries: List<RideSummary> = emptyList(),
    val selectedRideId: String? = null,
    val ride: Ride? = null,
    val weather: WeatherFix? = null,
    val scoreResult: WindScoreResult? = null,
    val isLoading: Boolean = true,
    val isLoadingRide: Boolean = false,
    val error: String? = null,
)

/**
 * Simplified port of wind.tsx: current conditions only (fetchWeather at the
 * route's start point), not the multi-day/hour forecast browsing UI —
 * weather/Weather.kt deliberately doesn't port groupForecastByDay/
 * closestHourIndex/isDaytimeHour (see its README note), which the full
 * day/hour picker needs. scoreRoute/buildWindSegments themselves (the real
 * algorithmic port, wind/WindScore.kt) work against any single WindSample
 * regardless — swapping in an hourly-forecast picker later only touches
 * this screen, not the scoring code.
 */
class WindViewModel(
    private val repository: RidesRepository = RidesRepository(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(WindUiState())
    val uiState: StateFlow<WindUiState> = _uiState.asStateFlow()

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, error = null)
        viewModelScope.launch {
            try {
                val summaries = repository.listRides()
                _uiState.value = _uiState.value.copy(summaries = summaries, isLoading = false)
                summaries.firstOrNull()?.let { selectRide(it.id) }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = e.message ?: "Couldn't load your rides")
            }
        }
    }

    fun selectRide(rideId: String) {
        _uiState.value =
            _uiState.value.copy(
                selectedRideId = rideId,
                isLoadingRide = true,
                ride = null,
                weather = null,
                scoreResult = null,
                error = null,
            )
        viewModelScope.launch {
            try {
                val ride = repository.getRide(rideId)
                val start = ride.points.firstOrNull()
                val weather = start?.let { fetchWeather(it.lat, it.lon) }
                val score = weather?.let { scoreRoute(ride.points, WindSample(it.windSpeedMs, it.windDirectionDeg)) }
                _uiState.value = _uiState.value.copy(ride = ride, weather = weather, scoreResult = score, isLoadingRide = false)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoadingRide = false, error = e.message ?: "Couldn't load wind for this ride")
            }
        }
    }
}
