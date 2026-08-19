package app.hodora.mobile.ui.permissions

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat

/**
 * Shared by NavScreen and RecordScreen — both are foreground Services that
 * need to keep running with the screen off, so both need the same
 * foreground-location -> background-location -> battery-exemption checklist
 * (Android 10+ requires background location to be requested as a separate
 * step after foreground location; see NavigationService.kt/RecordingService.kt
 * for the "why" of the underlying services). [startLabel] is the only thing
 * that differs between the two callers.
 */
fun hasFineLocation(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED

fun hasBackgroundLocation(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_BACKGROUND_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
}

fun isIgnoringBatteryOptimizations(context: Context): Boolean {
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return powerManager.isIgnoringBatteryOptimizations(context.packageName)
}

@Composable
fun BackgroundLocationChecklist(
    modifier: Modifier = Modifier,
    fineGranted: Boolean,
    backgroundGranted: Boolean,
    batteryExempt: Boolean,
    error: String?,
    startLabel: String,
    onRequestForeground: () -> Unit,
    onRequestBackground: () -> Unit,
    onRequestBatteryExemption: () -> Unit,
    onStart: () -> Unit,
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
    ) {
        Text("Before you start", style = MaterialTheme.typography.titleMedium)

        ChecklistRow(
            title = "Location access",
            done = fineGranted,
            description = "Required — used to track your position on the route.",
            actionLabel = "Grant",
            onAction = onRequestForeground,
        )
        ChecklistRow(
            title = "Background location",
            done = backgroundGranted,
            description = "Recommended — keeps this running with your phone locked or the app in your pocket. Choose \"Allow all the time\" when prompted.",
            actionLabel = "Grant",
            onAction = onRequestBackground,
            enabled = fineGranted,
        )
        ChecklistRow(
            title = "Battery optimization",
            done = batteryExempt,
            description = "Recommended — some phones aggressively kill background apps; exempting Hodora stops that from cutting things off mid-ride.",
            actionLabel = "Exempt",
            onAction = onRequestBatteryExemption,
        )

        error?.let {
            Text(
                text = it,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 16.dp),
            )
        }

        Button(
            onClick = onStart,
            enabled = fineGranted,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(top = 24.dp),
        ) {
            Text(startLabel)
        }
    }
}

@Composable
private fun ChecklistRow(
    title: String,
    done: Boolean,
    description: String,
    actionLabel: String,
    onAction: () -> Unit,
    enabled: Boolean = true,
) {
    Column(modifier = Modifier.padding(top = 16.dp)) {
        Text(
            text = if (done) "✓ $title" else title,
            style = MaterialTheme.typography.titleSmall,
            color = if (done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
        )
        Text(text = description, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
        if (!done) {
            OutlinedButton(onClick = onAction, enabled = enabled, modifier = Modifier.padding(top = 8.dp)) {
                Text(actionLabel)
            }
        }
    }
}
