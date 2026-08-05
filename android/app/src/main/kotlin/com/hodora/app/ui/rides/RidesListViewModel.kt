package com.hodora.app.ui.rides

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hodora.app.data.gpx.GpxParseException
import com.hodora.app.data.gpx.GpxParser
import com.hodora.app.data.model.RideSummary
import com.hodora.app.data.model.MeasurementUnit as HodoraUnit
import com.hodora.app.data.repository.PreferencesRepository
import com.hodora.app.data.repository.RideRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class RidesListUiState(
    val rides: List<RideSummary> = emptyList(),
    val unit: HodoraUnit = HodoraUnit.METRIC,
    val isImporting: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class RidesListViewModel @Inject constructor(
    private val repository: RideRepository,
    private val preferences: PreferencesRepository,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val importing = MutableStateFlow(false)
    private val error = MutableStateFlow<String?>(null)

    val uiState: StateFlow<RidesListUiState> = combine(
        repository.observeRides(),
        preferences.unit,
        importing,
        error,
    ) { rides, unit, isImporting, errorMessage ->
        RidesListUiState(rides, unit, isImporting, errorMessage)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), RidesListUiState())

    fun importGpx(uri: Uri) {
        viewModelScope.launch {
            importing.value = true
            try {
                val displayName = queryDisplayName(uri) ?: "Imported ride"
                val fallbackName = displayName.removeSuffix(".gpx")
                val parsed = context.contentResolver.openInputStream(uri)?.use { stream ->
                    GpxParser.parse(stream, fallbackName)
                } ?: throw GpxParseException("Couldn't open that file.")
                repository.saveParsedRide(parsed, displayName)
            } catch (e: GpxParseException) {
                error.value = e.message
            } catch (e: Exception) {
                error.value = "Something went wrong importing that file."
            } finally {
                importing.value = false
            }
        }
    }

    fun deleteRide(id: String) {
        viewModelScope.launch { repository.deleteRide(id) }
    }

    fun dismissError() {
        error.value = null
    }

    private fun queryDisplayName(uri: Uri): String? {
        if (uri.scheme != "content") return uri.lastPathSegment
        return context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (nameIndex >= 0 && cursor.moveToFirst()) cursor.getString(nameIndex) else null
        }
    }
}
