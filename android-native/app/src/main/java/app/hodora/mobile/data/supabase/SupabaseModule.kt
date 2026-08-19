package app.hodora.mobile.data.supabase

import app.hodora.mobile.BuildConfig
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest

/**
 * One Supabase client for the whole app — same project the web client
 * (src/integrations/supabase/client.ts) talks to. SUPABASE_URL/ANON_KEY
 * come from secrets.properties (see secrets.properties.example) via
 * BuildConfig, not hardcoded here.
 */
object SupabaseModule {
    val client by lazy {
        createSupabaseClient(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            supabaseKey = BuildConfig.SUPABASE_ANON_KEY,
        ) {
            install(Auth)
            install(Postgrest)
        }
    }
}
