package app.hodora.mobile.data.repository

import app.hodora.mobile.data.supabase.SupabaseModule
import app.hodora.mobile.net.HttpClientProvider
import io.github.jan.supabase.auth.auth
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Cloud sync (Google Drive/OneDrive/Nextcloud) against the same server
 * routes under src/routes/api/cloud/ that the web app uses — see
 * docs/NATIVE_ANDROID_PLAN.md's "Cloud sync OAuth" section for why these
 * can't be reimplemented client-side (the OAuth client secrets must stay
 * server-side). Unlike that section's original assumption, these routes
 * turned out to authenticate via a plain `Authorization: Bearer <jwt>`
 * header (see src/lib/api-auth.server.ts), not a browser cookie session —
 * so the native app can call them directly with the same Supabase access
 * token it already holds, no cookie/session sharing needed.
 *
 * What's NOT wired up: the seamless in-app OAuth return the plan doc
 * describes (a `hodora://cloud-callback` custom-scheme redirect) — that
 * needs server-side changes to authorize.tsx/callback.tsx (threading an
 * "from the app" hint through the signed `state` param so callback.tsx
 * redirects to the custom scheme instead of hodora.app/settings), which
 * touches live OAuth token-exchange code and felt like it deserved a
 * decision of its own rather than bundling it into this pass. For now,
 * Google Drive/OneDrive connect opens the consent screen in the system
 * browser and the rider switches back to Hodora manually afterward,
 * tapping "Refresh status" to see the result — Nextcloud (server URL + app
 * password, no redirect at all) has no such gap.
 */
enum class CloudProvider(val apiPath: String, val label: String) {
    GOOGLE_DRIVE("google-drive", "Google Drive"),
    ONEDRIVE("onedrive", "OneDrive"),
}

data class CloudStatus(
    val connected: Boolean,
    val accountLabel: String? = null,
    val folder: String? = null,
    val status: String? = null,
    val lastError: String? = null,
    val syncing: Boolean = false,
)

@Serializable
private data class StatusResponse(
    val connected: Boolean = false,
    val accountEmail: String? = null,
    val username: String? = null,
    val folder: String? = null,
    val status: String? = null,
    val lastError: String? = null,
    val syncing: Boolean = false,
)

@Serializable
private data class AuthorizeResponse(val ok: Boolean = false, val url: String? = null, val message: String? = null)

@Serializable
private data class OkResponse(val ok: Boolean = false, val message: String? = null)

private const val BASE_URL = "https://hodora.app/api/cloud"
private val json = Json { ignoreUnknownKeys = true }

class CloudSyncRepository {
    private val auth = SupabaseModule.client.auth
    private val client = HttpClientProvider.client

    // supabase-kt's Auth plugin exposes the current session's access token
    // via currentAccessTokenOrNull() as of the version pinned in
    // gradle/libs.versions.toml — same "check this first if it doesn't
    // compile against whatever Gradle actually resolves" caveat
    // RidesRepository.kt already documents for this SDK.
    private suspend fun bearerToken(): String = auth.currentAccessTokenOrNull() ?: error("Not signed in")

    suspend fun status(provider: CloudProvider): CloudStatus {
        val response =
            client.get("$BASE_URL/${provider.apiPath}/status") {
                header(HttpHeaders.Authorization, "Bearer ${bearerToken()}")
            }
        val body = json.decodeFromString<StatusResponse>(response.bodyAsText())
        return CloudStatus(
            connected = body.connected,
            accountLabel = body.accountEmail,
            folder = body.folder,
            status = body.status,
            lastError = body.lastError,
            syncing = body.syncing,
        )
    }

    /** POSTs to .../authorize and returns the OAuth consent URL to open in a browser. */
    suspend fun authorizeUrl(provider: CloudProvider): String {
        val response =
            client.post("$BASE_URL/${provider.apiPath}/authorize") {
                header(HttpHeaders.Authorization, "Bearer ${bearerToken()}")
                contentType(ContentType.Application.Json)
                setBody("{}")
            }
        val body = json.decodeFromString<AuthorizeResponse>(response.bodyAsText())
        return body.url ?: error(body.message ?: "Could not start sign-in")
    }

    suspend fun disconnect(provider: CloudProvider) {
        val response =
            client.post("$BASE_URL/${provider.apiPath}/disconnect") {
                header(HttpHeaders.Authorization, "Bearer ${bearerToken()}")
            }
        val body = json.decodeFromString<OkResponse>(response.bodyAsText())
        if (!body.ok) error(body.message ?: "Could not disconnect")
    }

    suspend fun nextcloudStatus(): CloudStatus {
        val response =
            client.get("$BASE_URL/nextcloud/status") {
                header(HttpHeaders.Authorization, "Bearer ${bearerToken()}")
            }
        val body = json.decodeFromString<StatusResponse>(response.bodyAsText())
        return CloudStatus(
            connected = body.connected,
            accountLabel = body.username,
            folder = body.folder,
            status = body.status,
            lastError = body.lastError,
            syncing = body.syncing,
        )
    }

    suspend fun connectNextcloud(
        serverUrl: String,
        username: String,
        appPassword: String,
        folder: String = "/Hodora",
    ) {
        val response =
            client.post("$BASE_URL/nextcloud/connect") {
                header(HttpHeaders.Authorization, "Bearer ${bearerToken()}")
                contentType(ContentType.Application.Json)
                setBody(
                    """{"url":${jsonString(serverUrl)},"username":${jsonString(username)},"appPassword":${jsonString(appPassword)},"folder":${jsonString(folder)}}""",
                )
            }
        val body = json.decodeFromString<OkResponse>(response.bodyAsText())
        if (!body.ok) error(body.message ?: "Could not connect to Nextcloud")
    }

    suspend fun disconnectNextcloud() {
        val response =
            client.post("$BASE_URL/nextcloud/disconnect") {
                header(HttpHeaders.Authorization, "Bearer ${bearerToken()}")
            }
        val body = json.decodeFromString<OkResponse>(response.bodyAsText())
        if (!body.ok) error(body.message ?: "Could not disconnect")
    }
}

/** Minimal JSON string escaping for the hand-built request bodies above (only quotes/backslashes are realistic in these fields). */
private fun jsonString(value: String): String = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
