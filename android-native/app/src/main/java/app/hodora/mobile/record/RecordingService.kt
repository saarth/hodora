package app.hodora.mobile.record

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
import app.hodora.mobile.gpx.RawTrackPoint
import app.hodora.mobile.gpx.formatDistance
import app.hodora.mobile.gpx.formatDuration
import app.hodora.mobile.gpx.haversine
import app.hodora.mobile.routing.LatLon
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * A separate foreground Service from nav/NavigationService.kt, not a reused
 * one — recording and turn-by-turn navigation share the "must keep running
 * with the screen off" requirement and the FusedLocationProviderClient +
 * persistent-notification mechanics that follow from it, but nothing about
 * their state machines (route-snapping/cues/rejoin/weather vs. plain
 * start/pause/resume/finish over a live GPS track) overlaps enough to be
 * worth threading through one class. Same architecture, deliberately
 * separate implementation — see RecordState.kt for the NavState-mirroring
 * StateFlow this publishes to.
 */
class RecordingService : Service() {
    private lateinit var fusedLocationClient: FusedLocationProviderClient

    private var status = RecordStatus.IDLE
    private var rawPoints: List<RawTrackPoint> = emptyList()
    private var distanceM = 0.0
    private var ascentM = 0.0

    // Elapsed time excludes paused spans, same bookkeeping as record.tsx's
    // startMsRef/pausedAccumMsRef/pauseStartedAtRef.
    private var startMs: Long = 0L
    private var pausedAccumMs: Long = 0L
    private var pauseStartedAtMs: Long? = null

    private val locationCallback =
        object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val location = result.lastLocation ?: return
                handleLocation(
                    lat = location.latitude,
                    lon = location.longitude,
                    ele = if (location.hasAltitude()) location.altitude else null,
                    headingDeg = if (location.hasBearing()) location.bearing.toDouble() else null,
                    speedMps = if (location.hasSpeed()) location.speed.toDouble() else null,
                )
            }
        }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        NotificationManagerCompat.from(this)
            .createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Recording", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Ongoing ride recording"
                },
            )
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int {
        when (intent?.action) {
            ACTION_START -> start()
            ACTION_PAUSE -> pause()
            ACTION_RESUME -> resume()
            ACTION_FINISH -> finish()
        }
        return START_STICKY
    }

    private fun start() {
        status = RecordStatus.RECORDING
        rawPoints = emptyList()
        distanceM = 0.0
        ascentM = 0.0
        startMs = System.currentTimeMillis()
        pausedAccumMs = 0L
        pauseStartedAtMs = null
        RecordState.reset()
        RecordState.update { it.copy(status = RecordStatus.RECORDING) }
        showForegroundNotification(buildNotification("Recording…"))
        requestLocationUpdates()
    }

    private fun pause() {
        if (status != RecordStatus.RECORDING) return
        status = RecordStatus.PAUSED
        pauseStartedAtMs = System.currentTimeMillis()
        RecordState.update { it.copy(status = RecordStatus.PAUSED) }
        notify(buildNotification("Paused — ${formatDistance(distanceM)}"))
    }

    private fun resume() {
        if (status != RecordStatus.PAUSED) return
        pauseStartedAtMs?.let { pausedAccumMs += System.currentTimeMillis() - it }
        pauseStartedAtMs = null
        status = RecordStatus.RECORDING
        RecordState.update { it.copy(status = RecordStatus.RECORDING) }
        notify(buildNotification("Recording…"))
    }

    private fun finish() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
        status = RecordStatus.STOPPED
        RecordState.update { it.copy(status = RecordStatus.STOPPED) }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    @SuppressLint("MissingPermission")
    private fun requestLocationUpdates() {
        val fineGranted =
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        if (!fineGranted) {
            RecordState.update { it.copy(status = RecordStatus.IDLE, error = "Location permission not granted") }
            stopSelf()
            return
        }
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, LOCATION_INTERVAL_MS).build()
        fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
    }

    private fun handleLocation(
        lat: Double,
        lon: Double,
        ele: Double?,
        headingDeg: Double?,
        speedMps: Double?,
    ) {
        // The live position/speed readout updates regardless of pause state
        // (record.tsx's `fix`, set unconditionally in the watchPosition
        // callback) — only point accumulation below is gated on RECORDING.
        RecordState.update {
            it.copy(livePosition = LatLon(lat, lon), headingDeg = headingDeg, currentSpeedMps = speedMps)
        }
        if (status != RecordStatus.RECORDING) return

        val tSec = (System.currentTimeMillis() - startMs - pausedAccumMs) / 1000.0
        val fix = RecordingFix(lat, lon, ele, tSec)
        val previousLast = rawPoints.lastOrNull()
        val updated = acceptRecordingFix(rawPoints, fix)
        if (updated !== rawPoints) {
            if (previousLast != null) {
                val current = updated.last()
                distanceM += haversine(previousLast.lat, previousLast.lon, current.lat, current.lon)
                val deltaEle = current.ele - previousLast.ele
                if (deltaEle > 0.5) ascentM += deltaEle
            }
            rawPoints = updated
        }

        RecordState.update { it.copy(rawPoints = rawPoints, distanceM = distanceM, ascentM = ascentM, elapsedSec = tSec) }
        notify(buildNotification("${formatDuration(tSec)} · ${formatDistance(distanceM)}"))
    }

    override fun onDestroy() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun notify(notification: Notification) {
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

    private fun actionPendingIntent(action: String): PendingIntent {
        val intent = Intent(this, RecordingService::class.java).apply { this.action = action }
        return PendingIntent.getService(this, action.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
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

        val builder =
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Hodora recording")
                .setContentText(text)
                .setSmallIcon(R.drawable.ic_stat_record)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(contentIntent)
                .addAction(0, "Finish", actionPendingIntent(ACTION_FINISH))
        if (status == RecordStatus.PAUSED) {
            builder.addAction(0, "Resume", actionPendingIntent(ACTION_RESUME))
        } else {
            builder.addAction(0, "Pause", actionPendingIntent(ACTION_PAUSE))
        }
        return builder.build()
    }

    companion object {
        const val ACTION_START = "app.hodora.mobile.record.action.START"
        const val ACTION_PAUSE = "app.hodora.mobile.record.action.PAUSE"
        const val ACTION_RESUME = "app.hodora.mobile.record.action.RESUME"
        const val ACTION_FINISH = "app.hodora.mobile.record.action.FINISH"
        private const val CHANNEL_ID = "hodora_recording"
        private const val NOTIFICATION_ID = 1002
        private const val LOCATION_INTERVAL_MS = 2000L
    }
}
