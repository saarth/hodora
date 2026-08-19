package app.hodora.mobile.record

import app.hodora.mobile.gpx.RawTrackPoint
import app.hodora.mobile.routing.LatLon
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class RecordStatus { IDLE, RECORDING, PAUSED, STOPPED }

data class RecordUiState(
    val status: RecordStatus = RecordStatus.IDLE,
    val rawPoints: List<RawTrackPoint> = emptyList(),
    /** Live position for the map/current-speed readout — updates even while paused, mirroring record.tsx's `fix` (separate from point accumulation, which pauses). */
    val livePosition: LatLon? = null,
    val headingDeg: Double? = null,
    val currentSpeedMps: Double? = null,
    val distanceM: Double = 0.0,
    val ascentM: Double = 0.0,
    val elapsedSec: Double = 0.0,
    val error: String? = null,
)

/**
 * Shared state between RecordingService (the source of truth, running in the
 * background even when RecordScreen isn't attached) and RecordScreen (which
 * just observes it) — same singleton-StateFlow pattern as nav/NavState.kt,
 * for the same reason: exactly one recording session at a time, all in one
 * process.
 */
object RecordState {
    private val _uiState = MutableStateFlow(RecordUiState())
    val uiState: StateFlow<RecordUiState> = _uiState.asStateFlow()

    fun update(transform: (RecordUiState) -> RecordUiState) {
        _uiState.value = transform(_uiState.value)
    }

    fun reset() {
        _uiState.value = RecordUiState()
    }
}
