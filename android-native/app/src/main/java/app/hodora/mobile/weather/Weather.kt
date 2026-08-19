package app.hodora.mobile.weather

import app.hodora.mobile.net.HttpClientProvider
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeParseException
import kotlin.math.roundToInt

/**
 * Partial port of src/lib/weather.ts — real-time weather for the rider's
 * live position, from the free public Open-Meteo API (no key). Only what
 * NavigationService needs for live headwind/tailwind and rain alerts is
 * ported: fetchWeather, fetchHourlyWind, findRainAlert. Not ported: the
 * departure-weather day/hour picker helpers (groupForecastByDay,
 * closestHourIndex, isDaytimeHour, formatHourLabel, weatherInfo/
 * WeatherIconKey) — those belong to the /plan page's weather-at-departure
 * panel, which isn't built yet (see Phase 2's notes in
 * docs/NATIVE_ANDROID_PLAN.md).
 */
data class WeatherFix(
    val temperatureC: Double,
    val apparentTemperatureC: Double,
    val precipitationMm: Double,
    val weatherCode: Int,
    val windSpeedMs: Double,
    val windGustMs: Double,
    /** degrees the wind is blowing FROM, meteorological convention */
    val windDirectionDeg: Double,
    val isDay: Boolean,
    val fetchedAtMs: Long,
)

data class HourlyForecast(
    /** local timestamp for this slot, e.g. "2026-08-16T15:00" (no UTC offset — Open-Meteo's timezone=auto) */
    val atIso: String,
    val temperatureC: Double,
    val windSpeedMs: Double,
    val windDirectionDeg: Double,
    val weatherCode: Int,
    val precipitationMm: Double,
    /** chance of precipitation, 0-100 */
    val precipitationProbability: Int,
)

data class RainAlert(
    /** unique per forecast slot, so the same hour is never alerted twice */
    val key: String,
    val atIso: String,
    val minutesAway: Int,
    val precipitationMm: Double,
    val probability: Int,
)

private const val WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast"
private const val CURRENT_FIELDS =
    "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day"
private const val HOURLY_FIELDS =
    "temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation,precipitation_probability"
private const val DEFAULT_FORECAST_DAYS = 8

private val json = Json { ignoreUnknownKeys = true; isLenient = true }

@Serializable
private data class OpenMeteoCurrentResponse(val current: CurrentBlock? = null)

@Serializable
private data class CurrentBlock(
    @SerialName("temperature_2m") val temperature2m: Double? = null,
    @SerialName("apparent_temperature") val apparentTemperature: Double? = null,
    val precipitation: Double? = null,
    @SerialName("weather_code") val weatherCode: Int? = null,
    @SerialName("wind_speed_10m") val windSpeed10m: Double? = null,
    @SerialName("wind_gusts_10m") val windGusts10m: Double? = null,
    @SerialName("wind_direction_10m") val windDirection10m: Double? = null,
    @SerialName("is_day") val isDay: Int? = null,
)

/** Fetches current conditions for a coordinate. Values are SI (°C, m/s); convert for display. */
suspend fun fetchWeather(
    lat: Double,
    lon: Double,
): WeatherFix {
    val url = "$WEATHER_ENDPOINT?latitude=$lat&longitude=$lon&current=$CURRENT_FIELDS&wind_speed_unit=ms&timezone=auto"
    val response = HttpClientProvider.client.get(url)
    if (!response.status.isSuccess()) error("Open-Meteo ${response.status.value}")
    val current =
        json.decodeFromString<OpenMeteoCurrentResponse>(response.bodyAsText()).current
            ?: error("Open-Meteo: no current weather")
    val temperature = current.temperature2m ?: error("Open-Meteo: no current weather")
    return WeatherFix(
        temperatureC = temperature,
        apparentTemperatureC = current.apparentTemperature ?: temperature,
        precipitationMm = current.precipitation ?: 0.0,
        weatherCode = current.weatherCode ?: 0,
        windSpeedMs = current.windSpeed10m ?: 0.0,
        windGustMs = current.windGusts10m ?: 0.0,
        windDirectionDeg = current.windDirection10m ?: 0.0,
        isDay = (current.isDay ?: 1) != 0,
        fetchedAtMs = System.currentTimeMillis(),
    )
}

@Serializable
private data class OpenMeteoHourlyResponse(val hourly: HourlyBlock? = null)

@Serializable
private data class HourlyBlock(
    val time: List<String> = emptyList(),
    @SerialName("temperature_2m") val temperature2m: List<Double?> = emptyList(),
    @SerialName("wind_speed_10m") val windSpeed10m: List<Double?> = emptyList(),
    @SerialName("wind_direction_10m") val windDirection10m: List<Double?> = emptyList(),
    @SerialName("weather_code") val weatherCode: List<Int?> = emptyList(),
    val precipitation: List<Double?> = emptyList(),
    @SerialName("precipitation_probability") val precipitationProbability: List<Int?> = emptyList(),
)

/**
 * Fetches an hourly wind/precipitation forecast for a coordinate,
 * `forecastDays` days out. Unlike fetchHourlyWind in weather.ts, this
 * doesn't cache by rounded coordinate — NavigationService's own
 * move/staleness throttle (mirroring useWeather's) already keeps this from
 * being called often enough for a cache to earn its keep here.
 */
suspend fun fetchHourlyWind(
    lat: Double,
    lon: Double,
    forecastDays: Int = DEFAULT_FORECAST_DAYS,
): List<HourlyForecast> {
    val url =
        "$WEATHER_ENDPOINT?latitude=$lat&longitude=$lon&hourly=$HOURLY_FIELDS&wind_speed_unit=ms" +
            "&timezone=auto&forecast_days=$forecastDays"
    val response = HttpClientProvider.client.get(url)
    if (!response.status.isSuccess()) error("Open-Meteo ${response.status.value}")
    val hourly =
        json.decodeFromString<OpenMeteoHourlyResponse>(response.bodyAsText()).hourly
            ?: error("Open-Meteo: no hourly forecast")
    return hourly.time.mapIndexed { i, atIso ->
        HourlyForecast(
            atIso = atIso,
            temperatureC = hourly.temperature2m.getOrNull(i) ?: 0.0,
            windSpeedMs = hourly.windSpeed10m.getOrNull(i) ?: 0.0,
            windDirectionDeg = hourly.windDirection10m.getOrNull(i) ?: 0.0,
            weatherCode = hourly.weatherCode.getOrNull(i) ?: 0,
            precipitationMm = hourly.precipitation.getOrNull(i) ?: 0.0,
            precipitationProbability = hourly.precipitationProbability.getOrNull(i) ?: 0,
        )
    }
}

/** Parses an Open-Meteo "timezone=auto" timestamp (e.g. "2026-08-16T15:00", no offset — local to the coordinate) as a LOCAL device timestamp, matching JS's `Date.parse` behavior for an offset-less date-time string. */
private fun parseLocalIsoToEpochMs(atIso: String): Long? =
    try {
        LocalDateTime.parse(atIso).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
    } catch (e: DateTimeParseException) {
        null
    }

/**
 * Finds the nearest upcoming hourly forecast slot (within `withinMinutes`,
 * a small negative slack included so "now" isn't missed by a few minutes of
 * clock drift) that crosses the rain thresholds and hasn't been alerted
 * yet. `hourly` must already be in chronological order (as fetchHourlyWind
 * returns it) since this returns the first match.
 */
fun findRainAlert(
    hourly: List<HourlyForecast>,
    nowMs: Long,
    alerted: Set<String>,
    withinMinutes: Int = 60,
    minProbability: Int = 50,
    minPrecipMm: Double = 0.2,
): RainAlert? {
    for (hour in hourly) {
        val atMs = parseLocalIsoToEpochMs(hour.atIso) ?: continue
        val minutesAway = (atMs - nowMs) / 60_000.0
        if (minutesAway < -10 || minutesAway > withinMinutes) continue
        val rains = hour.precipitationMm >= minPrecipMm || hour.precipitationProbability >= minProbability
        if (!rains || hour.atIso in alerted) continue
        return RainAlert(
            key = hour.atIso,
            atIso = hour.atIso,
            minutesAway = maxOf(0, minutesAway.roundToInt()),
            precipitationMm = hour.precipitationMm,
            probability = hour.precipitationProbability,
        )
    }
    return null
}

fun formatTemperature(
    celsius: Double,
    metric: Boolean = true,
): String {
    if (!celsius.isFinite()) return "—"
    return if (metric) "${celsius.roundToInt()}°C" else "${(celsius * 9 / 5 + 32).roundToInt()}°F"
}

fun formatWindSpeed(
    mps: Double,
    metric: Boolean = true,
): String {
    if (!mps.isFinite()) return "—"
    return if (metric) "${(mps * 3.6).roundToInt()} km/h" else "${(mps * 2.236936).roundToInt()} mph"
}
