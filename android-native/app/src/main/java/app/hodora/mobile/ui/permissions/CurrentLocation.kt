package app.hodora.mobile.ui.permissions

import android.annotation.SuppressLint
import android.content.Context
import app.hodora.mobile.routing.LatLon
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource

/**
 * One-shot current-location fix — shared by PlanScreen (center the planner
 * on open) and ExploreScreen (center the search area on open). lastLocation
 * is fast but can be null (fresh install, location services just enabled),
 * so this falls back to a fresh fix in that case. Caller must already have
 * checked ACCESS_FINE_LOCATION/ACCESS_COARSE_LOCATION before invoking this.
 */
@SuppressLint("MissingPermission")
fun fetchCurrentLocation(
    context: Context,
    onResult: (LatLon) -> Unit,
) {
    val client = LocationServices.getFusedLocationProviderClient(context)
    client.lastLocation.addOnSuccessListener { location ->
        if (location != null) {
            onResult(LatLon(location.latitude, location.longitude))
        } else {
            client
                .getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, CancellationTokenSource().token)
                .addOnSuccessListener { fresh -> fresh?.let { onResult(LatLon(it.latitude, it.longitude)) } }
        }
    }
}
