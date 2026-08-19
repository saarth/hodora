package app.hodora.mobile.offline

import android.content.Context
import android.util.Base64
import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.ui.map.cartoStyleJson
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.offline.OfflineManager
import org.maplibre.android.offline.OfflineRegion
import org.maplibre.android.offline.OfflineRegionError
import org.maplibre.android.offline.OfflineRegionStatus
import org.maplibre.android.offline.OfflineTilePyramidRegionDefinition
import kotlin.coroutines.resume

/**
 * Downloads the basemap tiles a route needs via MapLibre Native's built-in
 * OfflineManager, in place of porting offline-tiles.ts's hand-rolled
 * Cache-Storage tile math — the plan doc calls this out explicitly as
 * strictly better: its own SQLite-backed store (shared with the ambient
 * tile cache RouteMapView/PlanMapView already read from), resumable
 * downloads, and no manual zoom/URL bookkeeping to keep in sync with
 * CartoStyle.kt by hand.
 *
 * One real assumption worth flagging: OfflineTilePyramidRegionDefinition
 * needs a *style URL* it can resolve to find the tile source, but
 * CartoStyle.kt only ever builds an inline JSON string (there's no hosted
 * style.json for the CARTO raster style) — [dataUriStyle] below encodes
 * that JSON as a `data:` URI, which MapLibre/Mapbox GL Native has long
 * supported for style loading. Untested against a real Maven-resolved
 * build in this environment; if region creation fails with a style-parsing
 * error, that's the first thing to check.
 */
private const val MIN_ZOOM = 11.0
private const val MAX_ZOOM = 16.0

sealed interface RegionDownloadProgress {
    data class InProgress(val completed: Long, val required: Long) : RegionDownloadProgress

    data object Complete : RegionDownloadProgress

    data class Error(val message: String) : RegionDownloadProgress
}

private fun dataUriStyle(styleJson: String): String =
    "data:application/json;base64," + Base64.encodeToString(styleJson.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)

private fun regionMetadata(rideId: String): ByteArray = JSONObject().put("rideId", rideId).toString().toByteArray(Charsets.UTF_8)

private fun regionRideId(region: OfflineRegion): String? =
    runCatching { JSONObject(String(region.metadata, Charsets.UTF_8)).getString("rideId") }.getOrNull()

private fun boundsFor(points: List<RidePoint>): LatLngBounds {
    val builder = LatLngBounds.Builder()
    points.forEach { builder.include(LatLng(it.lat, it.lon)) }
    return builder.build()
}

/**
 * Downloads (or re-downloads — any existing region for this ride is deleted
 * first, so this also serves as "refresh") the tile pyramid covering
 * [points]' bounds. Collect the returned Flow for progress; it completes
 * after [RegionDownloadProgress.Complete] or [RegionDownloadProgress.Error].
 */
fun downloadRouteRegion(
    context: Context,
    rideId: String,
    points: List<RidePoint>,
    dark: Boolean,
): Flow<RegionDownloadProgress> =
    callbackFlow {
        removeRouteRegion(context, rideId)

        val definition =
            OfflineTilePyramidRegionDefinition(
                dataUriStyle(cartoStyleJson(dark)),
                boundsFor(points),
                MIN_ZOOM,
                MAX_ZOOM,
                context.resources.displayMetrics.density,
            )

        OfflineManager.getInstance(context).createOfflineRegion(
            definition,
            regionMetadata(rideId),
            object : OfflineManager.CreateOfflineRegionCallback {
                override fun onCreate(offlineRegion: OfflineRegion) {
                    offlineRegion.setObserver(
                        object : OfflineRegion.OfflineRegionObserver {
                            override fun onStatusChanged(status: OfflineRegionStatus) {
                                if (status.isComplete) {
                                    trySend(RegionDownloadProgress.Complete)
                                    close()
                                } else {
                                    trySend(RegionDownloadProgress.InProgress(status.completedResourceCount, status.requiredResourceCount))
                                }
                            }

                            override fun onError(error: OfflineRegionError) {
                                trySend(RegionDownloadProgress.Error(error.message ?: "Download failed"))
                                close()
                            }

                            override fun mapboxTileCountLimitExceeded(limit: Long) {
                                trySend(RegionDownloadProgress.Error("Tile limit exceeded"))
                                close()
                            }
                        },
                    )
                    offlineRegion.setDownloadState(OfflineRegion.STATE_ACTIVE)
                }

                override fun onError(error: String) {
                    trySend(RegionDownloadProgress.Error(error))
                    close()
                }
            },
        )

        // Downloading continues in MapLibre's own background thread even if
        // the collector goes away (e.g. the rider navigates off the screen
        // before it finishes) — same "keep the progress made" behavior as
        // leaving a browser tab's download running, rather than deleting a
        // partial region on cancellation.
        awaitClose {}
    }

private suspend fun findRegion(
    context: Context,
    rideId: String,
): OfflineRegion? =
    suspendCancellableCoroutine { cont ->
        OfflineManager.getInstance(context).listOfflineRegions(
            object : OfflineManager.ListOfflineRegionsCallback {
                override fun onList(offlineRegions: Array<OfflineRegion>?) {
                    cont.resume(offlineRegions?.firstOrNull { regionRideId(it) == rideId })
                }

                override fun onError(error: String) {
                    cont.resume(null)
                }
            },
        )
    }

suspend fun isRouteRegionSaved(
    context: Context,
    rideId: String,
): Boolean = findRegion(context, rideId) != null

suspend fun removeRouteRegion(
    context: Context,
    rideId: String,
) {
    val region = findRegion(context, rideId) ?: return
    suspendCancellableCoroutine<Unit> { cont ->
        region.delete(
            object : OfflineRegion.OfflineRegionDeleteCallback {
                override fun onDelete() = cont.resume(Unit)

                override fun onError(error: String) = cont.resume(Unit)
            },
        )
    }
}
