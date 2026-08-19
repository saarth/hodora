package app.hodora.mobile.nav

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.hodora.mobile.MainActivity
import app.hodora.mobile.R
import app.hodora.mobile.cues.CueSheetEntry
import app.hodora.mobile.cues.buildCueSheet
import app.hodora.mobile.data.model.RideNote
import app.hodora.mobile.data.repository.RidesRepository
import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.gpx.formatDistance
import app.hodora.mobile.gpx.haversine
import app.hodora.mobile.routing.LatLon
import app.hodora.mobile.routing.fetchCyclingRoute
import app.hodora.mobile.weather.HourlyForecast
import app.hodora.mobile.weather.WeatherFix
import app.hodora.mobile.weather.fetchHourlyWind
import app.hodora.mobile.weather.fetchWeather
import app.hodora.mobile.weather.findRainAlert
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * The reason this app exists as a native rewrite rather than staying a
 * Capacitor WebView shell: a foreground Service keeps reporting position,
 * detecting turns, updating a persistent notification, re-routing back to
 * the track when the rider strays off it (see [maybeRejoin], a port of
 * rejoin.ts's `useRejoinRoute`), watching for rain and proximity alerts
 * (see [maybeFetchWeather]/[checkRainAlert]/[checkProximityAlert]), and
 * speaking all of it via [VoiceAnnouncer] after the rider locks the screen
 * or backgrounds the app — every one of those things stops dead in the web
 * version the moment the tab is hidden (see AGENTS.md's "Background
 * navigation" note at the repo root for why that was never attempted
 * there).
 */
class NavigationService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val repository = RidesRepository()
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private var voice: VoiceAnnouncer? = null

    private var points: List<RidePoint> = emptyList()
    private var cueSheet: List<CueSheetEntry> = emptyList()
    private var lastSnapIndex = 0
    private val announced = mutableSetOf<String>()

    // Rejoin routing (src/lib/rejoin.ts's useRejoinRoute, run here instead
    // of as a Compose hook since it needs to keep working while this
    // screen isn't even visible). lastRejoinFrom/To + lastRejoinAtMs
    // replicate its throttle: only re-fetch after meaningful movement or
    // after minIntervalMs, so going off-route doesn't hammer the routers on
    // every ~2s location tick.
    private var rejoinJob: Job? = null
    private var lastRejoinFrom: LatLon? = null
    private var lastRejoinTo: LatLon? = null
    private var lastRejoinAtMs: Long = 0L

    private var notes: List<RideNote> = emptyList()
    private val alertedNoteIds = mutableSetOf<String>()

    // Weather (src/lib/weather.ts's useWeather + findRainAlert, run here
    // instead of a Compose hook/query for the same "must outlive this
    // screen" reason as rejoin routing). Current conditions and the hourly
    // forecast are refreshed together, throttled the same way useWeather
    // throttles its own refetches; the rain check itself runs every tick
    // (cheap, pure, no network) against whatever forecast is already cached.
    private var weatherJob: Job? = null
    private var lastWeatherPosition: LatLon? = null
    private var lastWeatherFetchAtMs: Long = 0L
    private var currentWeather: WeatherFix? = null
    private var hourlyForecast: List<HourlyForecast> = emptyList()
    private val rainAlerted = mutableSetOf<String>()

    private val locationCallback =
        object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val location = result.lastLocation ?: return
                handleLocation(
                    lat = location.latitude,
                    lon = location.longitude,
                    headingDeg = if (location.hasBearing()) location.bearing.toDouble() else null,
                )
            }
        }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        voice = VoiceAnnouncer(this)
        NotificationManagerCompat.from(this)
            .createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Navigation", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Ongoing turn-by-turn navigation"
                },
            )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> intent.getStringExtra(EXTRA_RIDE_ID)?.let(::start)
            ACTION_STOP -> stopNavigation()
        }
        return START_STICKY
    }

    private fun start(rideId: String) {
        showForegroundNotification(buildNotification("Loading route…"))
        NavState.update {
            it.copy(
                rideId = rideId,
                isRunning = true,
                isFinished = false,
                error = null,
                weather = null,
                wind = null,
                rainAlert = null,
                proximityAlert = null,
            )
        }
        scope.launch {
            try {
                val ride = repository.getRide(rideId)
                points = ride.points
                cueSheet = buildCueSheet(ride.points, ride.cues)
                notes = ride.notes
                lastSnapIndex = 0
                announced.clear()
                alertedNoteIds.clear()
                rejoinJob?.cancel()
                lastRejoinFrom = null
                lastRejoinTo = null
                lastRejoinAtMs = 0L
                weatherJob?.cancel()
                lastWeatherPosition = null
                lastWeatherFetchAtMs = 0L
                currentWeather = null
                hourlyForecast = emptyList()
                rainAlerted.clear()
                NavState.update {
                    it.copy(
                        rideName = ride.name,
                        routePoints = points,
                        totalDistanceM = points.lastOrNull()?.d?.toDouble() ?: ride.distanceM,
                        voiceEnabled = getVoicePreference(this@NavigationService),
                    )
                }
                requestLocationUpdates()
            } catch (e: Exception) {
                NavState.update { it.copy(isRunning = false, error = e.message ?: "Couldn't load this ride") }
                stopSelf()
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun requestLocationUpdates() {
        val fineGranted =
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        if (!fineGranted) {
            NavState.update { it.copy(isRunning = false, error = "Location permission not granted") }
            stopSelf()
            return
        }
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, LOCATION_INTERVAL_MS).build()
        fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
    }

    private fun handleLocation(
        lat: Double,
        lon: Double,
        headingDeg: Double?,
    ) {
        if (points.size < 2) return
        val snap = snapToRoute(points, lat, lon, lastSnapIndex)
        lastSnapIndex = snap.index

        val totalM = points.last().d.toDouble()
        val remainingM = (totalM - snap.progressM).coerceAtLeast(0.0)
        val finished = remainingM < FINISH_THRESHOLD_M
        val nextCueIndex = cueSheet.indexOfFirst { it.atM > snap.progressM + 5 }
        val nextCue = cueSheet.getOrNull(nextCueIndex)
        val nextCueDistanceM = nextCue?.let { it.atM - snap.progressM } ?: 0.0
        val offRoute = snap.offRouteM > OFF_ROUTE_THRESHOLD_M

        // GPS bearing is frequently null/stale at cycling speeds (Location.
        // hasBearing() often false when slow or stationary) — falling back
        // to the route's own direction of travel at the snapped index keeps
        // the map arrow pointing somewhere sensible instead of frozen at 0°.
        val effectiveHeading = headingDeg ?: routeBearing(points, snap.index)

        // Headwind/tailwind relative to the route's own direction of travel
        // (routeBearing again, not effectiveHeading — GPS heading is too
        // jittery at cycling speed for this, same reasoning as nav.tsx's
        // `wind` readout) using whatever current weather is already cached;
        // maybeFetchWeather below only refreshes it, doesn't block on it.
        val travelBearing = routeBearing(points, snap.index)
        val wind =
            currentWeather?.let { fix ->
                travelBearing?.let { bearingDeg ->
                    val relative = windRelativeAngle(bearingDeg, fix.windDirectionDeg)
                    NavWindInfo(
                        effect = windEffect(relative),
                        windSpeedMs = fix.windSpeedMs,
                        componentMs = windComponent(fix.windSpeedMs, relative),
                    )
                }
            }

        NavState.update {
            it.copy(
                position = NavPosition(lat, lon, effectiveHeading),
                snap = snap,
                distanceRemainingM = remainingM,
                nextCue = nextCue,
                nextCueDistanceM = nextCueDistanceM,
                offRoute = offRoute,
                isFinished = finished,
                wind = wind,
            )
        }

        notify(buildNotification(notificationText(nextCue, nextCueDistanceM, finished)))

        if (NavState.uiState.value.voiceEnabled && nextCue != null && nextCueIndex >= 0) {
            maybeAnnounce(nextCueIndex, nextCueDistanceM, nextCue)
        }

        if (offRoute && !finished) {
            maybeRejoin(from = LatLon(lat, lon), to = LatLon(snap.lat, snap.lon))
        } else {
            clearRejoin()
        }

        if (!finished) {
            maybeFetchWeather(LatLon(lat, lon))
            checkRainAlert()
            checkProximityAlert(snap.progressM)
        }

        if (finished) stopNavigation()
    }

    /**
     * Re-fetches a cycling path back to the track, throttled the same way
     * useRejoinRoute is on web: skip the fetch unless the rider (or the
     * rejoin point itself, which moves as they progress along the route)
     * has moved more than REJOIN_MIN_MOVE_M since the last fetch, or
     * REJOIN_MIN_INTERVAL_MS has elapsed either way.
     */
    private fun maybeRejoin(
        from: LatLon,
        to: LatLon,
    ) {
        val now = System.currentTimeMillis()
        val lastFrom = lastRejoinFrom
        val lastTo = lastRejoinTo
        val moved =
            lastFrom == null || lastTo == null ||
                haversine(lastFrom.lat, lastFrom.lon, from.lat, from.lon) > REJOIN_MIN_MOVE_M ||
                haversine(lastTo.lat, lastTo.lon, to.lat, to.lon) > REJOIN_MIN_MOVE_M
        if (!moved && now - lastRejoinAtMs < REJOIN_MIN_INTERVAL_MS) return

        lastRejoinFrom = from
        lastRejoinTo = to
        lastRejoinAtMs = now

        rejoinJob?.cancel()
        // A straight dashed line to the rejoin point shows immediately;
        // fetchCyclingRoute below upgrades it to a real routed path (or
        // leaves it as-is if both routers are unreachable).
        NavState.update {
            it.copy(
                rejoinPath = listOf(from, to),
                rejoinRouted = false,
                rejoinLoading = true,
                rejoinDistanceM = it.snap?.offRouteM ?: 0.0,
            )
        }
        rejoinJob =
            scope.launch {
                try {
                    val route = fetchCyclingRoute(from, to)
                    NavState.update {
                        it.copy(
                            rejoinPath = route.path,
                            rejoinRouted = route.routed,
                            rejoinLoading = false,
                            rejoinDistanceM = if (route.routed) route.distanceM else (it.snap?.offRouteM ?: 0.0),
                        )
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    NavState.update { it.copy(rejoinLoading = false) }
                }
            }
    }

    private fun clearRejoin() {
        if (lastRejoinFrom == null && lastRejoinTo == null) return
        rejoinJob?.cancel()
        lastRejoinFrom = null
        lastRejoinTo = null
        lastRejoinAtMs = 0L
        NavState.update {
            it.copy(rejoinPath = emptyList(), rejoinRouted = false, rejoinLoading = false, rejoinDistanceM = 0.0)
        }
    }

    /**
     * Refreshes current conditions + the hourly forecast for rain alerts,
     * throttled the same way useWeather is on web: skip unless the rider
     * has moved more than WEATHER_MIN_MOVE_M since the last fetch, or
     * WEATHER_MIN_INTERVAL_MS has elapsed. Both requests share one throttle
     * (web's useWeather and the rain-forecast query are throttled
     * separately by different triggers) since they're driven by the same
     * rider position and there's no reason to fetch them on different
     * cadences here.
     */
    private fun maybeFetchWeather(position: LatLon) {
        val now = System.currentTimeMillis()
        val last = lastWeatherPosition
        val moved = last == null || haversine(last.lat, last.lon, position.lat, position.lon) > WEATHER_MIN_MOVE_M
        val stale = lastWeatherFetchAtMs == 0L || now - lastWeatherFetchAtMs > WEATHER_MIN_INTERVAL_MS
        if (!moved && !stale) return
        if (weatherJob?.isActive == true) return

        lastWeatherPosition = position
        lastWeatherFetchAtMs = now
        weatherJob =
            scope.launch {
                try {
                    val weather = fetchWeather(position.lat, position.lon)
                    currentWeather = weather
                    NavState.update { it.copy(weather = weather) }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // Keep whatever weather/wind readout was already showing.
                }
                try {
                    hourlyForecast = fetchHourlyWind(position.lat, position.lon)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // Keep the previous forecast for the rain check below.
                }
            }
    }

    /** Pure/cheap — runs every location tick against whatever forecast maybeFetchWeather last cached, no network call of its own. */
    private fun checkRainAlert() {
        if (hourlyForecast.isEmpty()) return
        val alert = findRainAlert(hourlyForecast, System.currentTimeMillis(), rainAlerted) ?: return
        rainAlerted.add(alert.key)
        val message = if (alert.minutesAway <= 2) "Rain is starting" else "Rain expected in about ${alert.minutesAway} min"
        NavState.update { it.copy(rainAlert = alert) }
        if (NavState.uiState.value.voiceEnabled) voice?.speak(message)
    }

    /** Port of the proximity-alert wiring in rides.$id.nav.tsx, built on the same live position stream as everything else here rather than a separate background-geolocation plugin. */
    private fun checkProximityAlert(progressM: Double) {
        if (notes.isEmpty()) return
        val note =
            findProximityAlert(
                notes = notes,
                progressM = progressM,
                alerted = alertedNoteIds,
                idOf = { it.id },
                distanceMOf = { it.distanceM },
            ) ?: return
        alertedNoteIds.add(note.id)
        NavState.update { it.copy(proximityAlert = ProximityAlert(noteId = note.id, text = note.text)) }
        if (NavState.uiState.value.voiceEnabled) voice?.speak(note.text)
    }

    private fun notificationText(
        nextCue: CueSheetEntry?,
        distanceM: Double,
        finished: Boolean,
    ): String =
        when {
            finished -> "Arrived"
            nextCue != null -> "${formatDistance(distanceM)} · ${nextCue.text}"
            else -> "Navigating"
        }

    private fun maybeAnnounce(
        turnIndex: Int,
        distanceM: Double,
        cue: CueSheetEntry,
    ) {
        val next = VoiceAnnouncer.nextAnnouncement(turnIndex, distanceM, announced) ?: return
        announced.add(next.first)
        val phrase =
            "In ${VoiceAnnouncer.speakableDistance(next.second, metric = true)}, ${cue.text.replaceFirstChar { it.lowercaseChar() }}"
        voice?.speak(phrase)
    }

    private fun stopNavigation() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
        rejoinJob?.cancel()
        weatherJob?.cancel()
        NavState.update { it.copy(isRunning = false) }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        scope.cancel()
        voice?.shutdown()
        fusedLocationClient.removeLocationUpdates(locationCallback)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun notify(notification: Notification) {
        // POST_NOTIFICATIONS (API 33+) is a runtime permission; the ongoing
        // foreground-service notification is exempt from it, but re-posting
        // updates to the same id via NotificationManagerCompat isn't
        // guaranteed to be, so guard this the same way any other
        // notification update would need to be. checkSelfPermission on a
        // pre-33 device always returns GRANTED for this permission since it
        // doesn't apply there.
        val granted =
            ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        if (granted) NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, notification)
    }

    private fun showForegroundNotification(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(text: String): Notification {
        val openIntent =
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
        val contentIntent =
            PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        val stopIntent = Intent(this, NavigationService::class.java).apply { action = ACTION_STOP }
        val stopPendingIntent =
            PendingIntent.getService(
                this,
                0,
                stopIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Hodora navigation")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_stat_navigation)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(contentIntent)
            .addAction(0, "Stop", stopPendingIntent)
            .build()
    }

    companion object {
        const val ACTION_START = "app.hodora.mobile.nav.action.START"
        const val ACTION_STOP = "app.hodora.mobile.nav.action.STOP"
        const val EXTRA_RIDE_ID = "rideId"
        private const val CHANNEL_ID = "hodora_navigation"
        private const val NOTIFICATION_ID = 1001
        private const val LOCATION_INTERVAL_MS = 2000L

        // Matches src/routes/rides.$id.nav.tsx's `offRoute = snap.offRouteM > 40`.
        private const val OFF_ROUTE_THRESHOLD_M = 40.0
        private const val FINISH_THRESHOLD_M = 15.0

        // Matches useRejoinRoute's defaults in src/lib/rejoin.ts.
        private const val REJOIN_MIN_MOVE_M = 30.0
        private const val REJOIN_MIN_INTERVAL_MS = 8000L

        // Matches useWeather's defaults in src/lib/weather.ts.
        private const val WEATHER_MIN_MOVE_M = 5000.0
        private const val WEATHER_MIN_INTERVAL_MS = 10 * 60 * 1000L
    }
}
