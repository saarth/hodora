package com.hodora.app.data.repository

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.hodora.app.data.model.MeasurementUnit as HodoraUnit
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "hodora_prefs")

/** Local-only unit + theme preferences (no account/profile in Phase 1 — see PreferencesRepository vs. web's `profiles.unit`). */
@Singleton
class PreferencesRepository @Inject constructor(@ApplicationContext private val context: Context) {

    private object Keys {
        val UNIT = stringPreferencesKey("unit")
        val DARK_THEME_OVERRIDE = booleanPreferencesKey("dark_theme_override")
        val HAS_DARK_THEME_OVERRIDE = booleanPreferencesKey("has_dark_theme_override")
    }

    val unit = context.dataStore.data.map { prefs ->
        when (prefs[Keys.UNIT]) {
            "imperial" -> HodoraUnit.IMPERIAL
            else -> HodoraUnit.METRIC
        }
    }

    /** null = follow system theme. */
    val darkThemeOverride = context.dataStore.data.map { prefs ->
        if (prefs[Keys.HAS_DARK_THEME_OVERRIDE] == true) prefs[Keys.DARK_THEME_OVERRIDE] else null
    }

    suspend fun setUnit(unit: HodoraUnit) {
        context.dataStore.edit { prefs ->
            prefs[Keys.UNIT] = if (unit == HodoraUnit.IMPERIAL) "imperial" else "metric"
        }
    }

    suspend fun setDarkThemeOverride(value: Boolean?) {
        context.dataStore.edit { prefs ->
            if (value == null) {
                prefs[Keys.HAS_DARK_THEME_OVERRIDE] = false
            } else {
                prefs[Keys.HAS_DARK_THEME_OVERRIDE] = true
                prefs[Keys.DARK_THEME_OVERRIDE] = value
            }
        }
    }
}
