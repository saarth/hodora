package com.hodora.app.ui.navigation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.location.Location
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.hodora.app.MainActivity
import com.hodora.app.R
import com.hodora.app.data.nav.NavMath
import com.hodora.app.data.repository.RideRepository
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Real Android foreground service (not just a background coroutine) so
 * turn-by-turn tracking keeps running with the screen off or the app
 * backgrounded — the main reason this is a native app instead of the PWA.
 * State is published via a StateFlow companion object rather than a Binder,
 * since there is only ever one active navigation session at a time.
 */
@AndroidEntryPoint
class NavigationService : Service() {

    @Inject lateinit var rideRepository: RideRepository

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private var points: List<com.hodora.app.data.model.RidePoint> = emptyList()
    private var turns: List<com.hodora.app.data.model.Turn> = emptyList()
    private var totalDistanceM: Double = 0.0
    private var lastIndex = 0
    private var currentRideId: String = ""

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val rideId = intent?.getStringExtra(EXTRA_RIDE_ID)
        startForeground(NOTIFICATION_ID, buildNotification("Starting navigation…", null))
        if (rideId != null && rideId != currentRideId) {
            currentRideId = rideId
            loadRideAndStart(rideId)
        }
        return START_STICKY
    }

    private fun loadRideAndStart(rideId: String) {
        serviceScope.launch {
            val ride = rideRepository.getRide(rideId)
            if (ride == null || ride.points.size < 2) {
                stopSelf()
                return@launch
            }
            points = ride.points
            turns = NavMath.detectTurns(points)
            totalDistanceM = ride.distanceM
            lastIndex = 0
            startLocationUpdates()
        }
    }

    private fun startLocationUpdates() {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 2_000L)
            .setMinUpdateIntervalMillis(1_000L)
            .setWaitForAccurateLocation(false)
            .build()
        try {
            fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
        } catch (e: SecurityException) {
            stopSelf()
        }
    }

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let(::onNewLocation)
        }
    }

    private fun onNewLocation(location: Location) {
        if (points.size < 2) return
        val snap = NavMath.snapToRoute(points, location.latitude, location.longitude, lastIndex)
        lastIndex = snap.index

        val offRoute = snap.offRouteM > NavMath.OFF_ROUTE_THRESHOLD_M
        val finished = (totalDistanceM - snap.progressM) <= NavMath.FINISH_RADIUS_M
        val nextTurn = NavMath.nextTurn(turns, snap.progressM)

        val newState = NavServiceState(
            rideId = currentRideId,
            points = points,
            snap = snap,
            turns = turns,
            nextTurn = nextTurn,
            offRoute = offRoute,
            finished = finished,
            remainingAscentM = NavMath.remainingAscent(points, snap.index),
            gradePercent = NavMath.upcomingGrade(points, snap.index),
            speedMps = if (location.hasSpeed()) location.speed.toDouble() else 0.0,
            headingDeg = if (location.hasBearing()) location.bearing.toDouble() else 0.0,
            distanceM = totalDistanceM,
        )
        _state.value = newState
        updateNotification(newState)
    }

    private fun updateNotification(state: NavServiceState) {
        val title = when {
            state.finished -> "Ride finished"
            state.offRoute -> "Off route"
            state.nextTurn != null -> NavMath.turnLabel(state.nextTurn.direction)
            else -> "On route"
        }
        val distanceToGo = (state.distanceM - state.snap.progressM).coerceAtLeast(0.0)
        val text = "${com.hodora.app.data.format.Formatters.distance(distanceToGo, true)} to go"
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(title, text))
    }

    private fun buildNotification(title: String, text: String?): Notification {
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(contentIntent)
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.nav_notification_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply { description = getString(R.string.nav_notification_channel_desc) }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
        serviceScope.cancel()
        _state.value = null
        currentRideId = ""
        super.onDestroy()
    }

    companion object {
        private const val EXTRA_RIDE_ID = "rideId"
        private const val CHANNEL_ID = "navigation"
        private const val NOTIFICATION_ID = 1001

        private val _state = MutableStateFlow<NavServiceState?>(null)
        val state: StateFlow<NavServiceState?> = _state.asStateFlow()

        fun start(context: Context, rideId: String) {
            val intent = Intent(context, NavigationService::class.java).putExtra(EXTRA_RIDE_ID, rideId)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, NavigationService::class.java))
        }
    }
}
