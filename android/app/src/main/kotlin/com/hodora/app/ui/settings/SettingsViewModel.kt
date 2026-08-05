package com.hodora.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hodora.app.data.model.MeasurementUnit as HodoraUnit
import com.hodora.app.data.repository.PreferencesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val preferences: PreferencesRepository,
) : ViewModel() {

    val unit: StateFlow<HodoraUnit> = preferences.unit
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HodoraUnit.METRIC)

    /** null = follow system theme. */
    val darkThemeOverride: StateFlow<Boolean?> = preferences.darkThemeOverride
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun setUnit(unit: HodoraUnit) {
        viewModelScope.launch { preferences.setUnit(unit) }
    }

    fun setDarkThemeOverride(value: Boolean?) {
        viewModelScope.launch { preferences.setDarkThemeOverride(value) }
    }
}
