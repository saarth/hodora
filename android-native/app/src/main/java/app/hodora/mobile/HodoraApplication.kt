package app.hodora.mobile

import android.app.Application
import app.hodora.mobile.data.local.OfflineStore
import org.maplibre.android.MapLibre

class HodoraApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // No API key needed — Hodora only ever points MapLibre at the free
        // CARTO raster basemap (see RouteMapView.kt), same as the web app's
        // zero-config default (src/components/RouteMap.tsx).
        MapLibre.getInstance(this)
        // Phase 5: the offline ride cache (Room) — see data/local/OfflineStore.kt.
        OfflineStore.init(this)
    }
}
