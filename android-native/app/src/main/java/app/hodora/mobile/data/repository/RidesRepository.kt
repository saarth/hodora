package app.hodora.mobile.data.repository

import app.hodora.mobile.data.model.RideSummary
import app.hodora.mobile.data.supabase.SupabaseModule
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order

class RidesRepository {
    private val postgrest = SupabaseModule.client.postgrest

    // RLS (supabase/migrations/) scopes this to the signed-in rider's own
    // rows automatically via the session's JWT — same as the web client,
    // no user_id filter needed here.
    suspend fun listRides(): List<RideSummary> =
        postgrest
            .from("rides")
            .select(
                columns =
                    Columns.list(
                        "id",
                        "name",
                        "description",
                        "distance_m",
                        "ascent_m",
                        "descent_m",
                        "created_at",
                    ),
            ) {
                order("created_at", Order.DESCENDING)
            }
            .decodeList<RideSummary>()
}
