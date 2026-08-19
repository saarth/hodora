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
import app.hodora.mobile.cues.CueSheetEntry
import app.hodora.mobile.cues.buildCueSheet
import app.hodora.mobile.data.repository.RidesRepository
import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.gpx.formatDistance
import app.hodora.mobile.gpx.haversine
import app.hodora.mobile.routing.LatLon
import app.hodora.mobile.routing.fetchCyclingRoute
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
 * rejoin.ts's `useRejoinRoute`), and speaking cues via [VoiceAnnouncer]
 * after the rider locks the screen or backgrounds the app — every one of
 * those things stops dead in the web version the moment the tab is hidden
 * (see AGENTS.md's "Background navigation" note at the repo root for why
 * that was never attempted there).
 *
 * Deliberately out of scope for this first cut (see docs/NATIVE_ANDROID_PLAN.md):
 * rain/wind alerts (weather.ts isn't ported yet), proximity alerts on ride
 * notes (notes aren't modeled on Ride yet), and a live position marker on
 * the nav map (NavScreen currently shows the full route for orientation
 * only).
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
        NavState.update { it.copy(rideId = rideId, isRunning = true, isFinished = false, error = null) }
        scope.launch {
            try {
                val ride = repository.getRide(rideId)
                points = ride.points
                cueSheet = buildCueSheet(ride.points, ride.cues)
                lastSnapIndex = 0
                announced.clear()
                rejoinJob?.cancel()
                lastRejoinFrom = null
                lastRejoinTo = null
                lastRejoinAtMs = 0L
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

        NavState.update {
            it.copy(
                position = NavPosition(lat, lon, headingDeg),
                snap = snap,
                distanceRemainingM = remainingM,
                nextCue = nextCue,
                nextCueDistanceM = nextCueDistanceM,
                offRoute = offRoute,
                isFinished = finished,
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
            .setSmallIcon(android.R.drawable.ic_menu_directions)
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
    }
}
