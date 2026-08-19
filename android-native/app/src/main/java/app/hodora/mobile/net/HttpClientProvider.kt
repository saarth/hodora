package app.hodora.mobile.net

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp

/** One shared Ktor client for the plain public REST calls the app makes outside Supabase (BRouter, OSRM, ...). */
object HttpClientProvider {
    val client by lazy { HttpClient(OkHttp) }
}
