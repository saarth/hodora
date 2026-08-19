package app.hodora.mobile.share

import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.net.HttpClientProvider
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Client for GET /api/share/{token} — the same public, unauthenticated
 * lookup src/routes/api/share/$token.tsx serves the web share page from.
 * No Supabase client involved: the token itself is the authorization, same
 * as on web (the server reads through the service-role client, not RLS,
 * since an anonymous visitor has no session for RLS to scope against).
 */
@Serializable
data class SharedRide(
    val id: String,
    val name: String,
    val points: List<RidePoint> = emptyList(),
    val distanceM: Double = 0.0,
    val ascentM: Double = 0.0,
    val descentM: Double = 0.0,
)

@Serializable
data class SharedWind(
    val hour: String? = null,
    val speedMs: Double? = null,
    val directionDeg: Double? = null,
    val temperatureC: Double? = null,
    val weatherCode: Int? = null,
)

@Serializable
data class SharePayload(
    val ride: SharedRide,
    val wind: SharedWind,
    val sharedAt: String,
)

private const val SHARE_BASE_URL = "https://hodora.app/api/share"
private val json = Json { ignoreUnknownKeys = true }

suspend fun fetchSharedRide(token: String): SharePayload {
    val response = HttpClientProvider.client.get("$SHARE_BASE_URL/$token")
    if (!response.status.isSuccess()) error("Share link not found")
    return json.decodeFromString<SharePayload>(response.bodyAsText())
}
