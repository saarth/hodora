# Hodora — native Android app

This is a from-scratch native Android app (Kotlin + Jetpack Compose), built
alongside — not replacing — `android/` (the Capacitor WebView shell). See
**[docs/NATIVE_ANDROID_PLAN.md](../docs/NATIVE_ANDROID_PLAN.md)** at the repo
root for why this exists (short version: background turn-by-turn navigation
is structurally impossible in a WebView — mobile browsers throttle
`geolocation.watchPosition()` the moment the screen locks) and the full
phased roadmap.

## Status: Phases 0-6 — scaffold through Explore/Wind/sharing/cloud sync

**Phases 0-3 have been through real-device fixes** (from actual Android
Studio builds — map rendering, camera/follow behavior, background nav).
**Phases 4-6 have not been run on a device yet** and should be treated with
the same skepticism Phases 0-3 warranted before their fix round: written
correct as far as static reading can tell, genuinely unverified beyond
that.

What's here so far:

- Project skeleton: Gradle Kotlin DSL + version catalog
  (`gradle/libs.versions.toml`), Jetpack Compose, Material 3.
- Supabase auth (`data/repository/AuthRepository.kt`) — sign in, sign up,
  password reset, sign out — against the **same Supabase project** the web
  app uses.
- A rides list screen (`ui/rides/`) reading from the `rides` table via
  Postgrest, scoped by Row Level Security exactly like the web client (no
  server code needed or duplicated) — plus a **GPX import** flow (system
  file picker → parse → save as a new ride).
- A full port of `src/lib/gpx.ts` at `gpx/Gpx.kt` — GPX parsing (Android's
  built-in `XmlPullParser`, no XML library dependency), the RDP route
  simplifier, haversine/bearing math, elevation smoothing, and GPX
  serialization for export. Same algorithms as the web app, so a route
  imported here gets the same distance/ascent/point count it would on web.
- A ride detail screen (`ui/ridedetail/`) — MapLibre Native route map
  (`ui/map/RouteMapView.kt`, same free CARTO raster basemap the web app
  defaults to), a Compose `Canvas` elevation profile, and **GPX export** via
  the system "save file" picker.
- A route planner (`ui/plan/`) — tap the map to drop waypoints, reroute
  through BRouter (preferred, respects the chosen bike profile) falling back
  to OSRM then a straight line, live distance/ascent, undo/clear, and save
  as a new ride with `plan_waypoints`/`plan_profile`/`cues` populated. A full
  port of `src/lib/routing.ts` lives at `routing/Routing.kt`.
- **Background turn-by-turn navigation** (`nav/`) — the actual point of this
  rewrite. `NavigationService.kt` is a foreground `Service`
  (`foregroundServiceType="location"`) that keeps running after the rider
  locks the screen or backgrounds the app: it snaps live GPS position to the
  route (`nav/Nav.kt`, a full port of `src/lib/nav.ts`), updates a persistent
  notification (a real hand-drawn status-bar icon, not a system placeholder)
  with the next turn, and speaks cues via Android's native `TextToSpeech`
  (`nav/VoiceAnnouncer.kt`, replacing the Web Speech API `voice.ts` used,
  which mobile browsers suspend the instant the tab is hidden). `cues.ts` is
  now fully ported (`cues/Cues.kt`) — a route without router-provided
  instructions falls back to geometry-detected turns, same as web. Going
  off-route re-routes back to the track (`maybeRejoin` in
  `NavigationService.kt`, a full port of `rejoin.ts`'s throttled
  `useRejoinRoute`) via BRouter/OSRM, falling back to a straight line, drawn
  on the map the same solid-when-routed/dashed-when-fallback way
  `RouteMap.tsx` does, alongside a live heading-rotated arrow showing the
  rider's own position (falling back to the route's own direction of travel
  when GPS bearing is unavailable, which is common at cycling speed). A
  partial port of `weather.ts` (`weather/Weather.kt` — just `fetchWeather`/
  `fetchHourlyWind`/`findRainAlert`, not the departure-weather picker
  helpers) drives a live headwind/tailwind readout and a one-shot rain-alert
  snackbar; ride notes are modeled now too (`RideNote` in
  `data/model/Ride.kt`) so passing one raises a proximity-alert snackbar
  (and voice cue, if enabled) via `findProximityAlert`. `ui/nav/NavScreen.kt`
  (reached via "Start navigation" on ride detail) walks through the
  background-location permission flow (a separate step from foreground
  location on Android 10+) and an optional battery-optimization exemption
  prompt before handing off to the service.
- **Ride recording** (`record/`) — `RecordingService.kt` is a *separate*
  foreground Service from `NavigationService` (same architecture — a
  persistent notification, `FusedLocationProviderClient` running with the
  screen off — deliberately not the same class, since recording's plain
  start/pause/resume/finish over a live GPS track shares no state machine
  with nav's route-snapping/cues/rejoin/weather logic). `record/Record.kt`
  ports `record.ts`'s GPS-jitter filtering. `ui/record/RecordScreen.kt`
  reuses the same background-location permission checklist and the map's
  follow-mode/recenter button navigation already has.
- **Offline** — `data/local/OfflineStore.kt` is a Room-backed cache (rides
  as their own serialized JSON, plus a cached ride-list snapshot) that
  `RidesRepository` falls back to on any network failure, the Kotlin
  equivalent of `offline-db.ts`'s IndexedDB store. Map tiles download via
  MapLibre Native's built-in `OfflineManager` (`offline/OfflineMaps.kt`)
  rather than a port of `offline-tiles.ts`'s hand-rolled tile math.
  `RideDetailScreen` has a "Save for offline" action driving both. Not
  cached: a user Profile (no settings screen exists yet to hang one off of).
- **Explore** (`discover/Discover.kt`, `ui/explore/`) — signposted cycle
  routes near a point via Overpass, plus generated loop rides via
  `fetchRoute`, both saveable to your rides. Not ported: typed place search
  (a separate geocoding integration) — "My location" plus re-searching the
  map center covers the core loop.
- **Wind** (`wind/WindScore.kt`, `ui/wind/`) — a direct port of
  `windScore.ts`'s route-segment wind scoring, built on `nav/Nav.kt`'s
  existing wind primitives. The screen itself is simplified to
  current-conditions scoring for a picked ride, not `wind.tsx`'s full
  multi-day/hour forecast picker (needs `weather.ts` helpers
  `weather/Weather.kt` doesn't port — see that file's own note).
- **Shared routes** (`share/SharedRide.kt`, `ui/share/`) — an
  `https://hodora.app/share/{id}` App Link opens `SharedRideScreen`
  straight from `MainActivity`, bypassing the sign-in gate the same way the
  web share page is public. Needs a real `assetlinks.json` deployed at
  `hodora.app/.well-known/` for Android to auto-verify the link (a
  server-side step outside this module).
- **Cloud sync** (`data/repository/CloudSyncRepository.kt`, `ui/cloud/`) —
  connect/status/disconnect for Google Drive, OneDrive, and Nextcloud
  against the existing `src/routes/api/cloud/**` server routes, which
  authenticate via a plain Bearer JWT the app already holds. Not wired up:
  the seamless in-app OAuth return (a `hodora://` custom-scheme redirect) —
  that needs changes to live `authorize.tsx`/`callback.tsx` OAuth code, so
  it's flagged as a deliberate follow-up rather than bundled in silently
  (see that file's doc comment). Google Drive/OneDrive connect opens the
  system browser today; the rider switches back manually. Nextcloud has no
  such gap — it's a plain server URL + app password form, no redirect.
- Nav host (`ui/navigation/HodoraNavHost.kt`) that switches between the auth
  screen, rides list, ride detail, the planner, recording, Explore, Wind,
  cloud sync, and navigation based on Supabase session state — plus the
  App Link handling above for shared routes.

What's deliberately **not** here yet (see the plan doc's phases): reopening
a saved planned route to edit it, weather-at-departure on the planner,
typed place search on Explore, the Wind forecast day/hour picker, seamless
cloud-sync OAuth return, and ported `*.test.ts` → JUnit test coverage.
Phases 0-6's code is done; what's left for 4-6 is the same real-device
validation round Phases 0-3 already went through — see "What's left"
below. Phase 7 (retiring `android/`) is a deliberate stop, not a task in
progress — see the plan doc's Phase 7 section for why.

**Visual design pass.** Wasn't part of the original phased plan — the app
started out plain Material 3 (two brand colors, everything else default).
`ui/theme/` now carries the web app's full design system: a `ColorScheme`
built from `src/styles.css`'s oklch tokens (light and dark), and Space
Grotesk/Fraunces-italic/IBM Plex Mono as bundled variable-font resources
under `res/font/` (not Google's downloadable-fonts provider — bundling
keeps them available offline, matching the rest of the app). Shared
composables in `ui/components/HodoraComponents.kt`
(`HodoraCard`/`HodoraButton`/`StatFigure`/`Caption`/`HodoraChip`) reproduce
the web app's `.surface` card recipe and stat-figure typography, and are
what the rides list, ride detail, navigation, and record screens are built
from — those four were mocked up first as a design canvas and then
implemented pixel-for-pixel here. Other screens (Explore, Wind, cloud sync,
the planner, auth) still use plain Material 3 components, so they pick up
the new colors/typography automatically but not the custom card/button
shapes yet.

## Building it

You'll need [Android Studio](https://developer.android.com/studio) (same
requirement as `android/`, the Capacitor project — this repo doesn't vendor
the Android SDK).

1. Copy `secrets.properties.example` to `secrets.properties` and fill in
   your Supabase project's URL and anon/publishable key — the same values
   as the web app's `.env` (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`). This file is gitignored; the anon key
   is safe to ship in an APK, RLS does the actual access control.
2. Open this `android-native/` folder in Android Studio (not the repo
   root — it's a separate Gradle project from `android/`).
3. Let Gradle sync. **This scaffold was written without access to the
   Android SDK or Maven Central** (see the note at the top of
   `gradle/libs.versions.toml`), so treat a sync failure as "this dependency
   version needs bumping," not as a sign something is fundamentally wrong —
   Android Studio's quick-fixes / version catalog suggestions should get it
   the rest of the way.
4. Run on a device or emulator.

The debug build type uses `applicationIdSuffix = ".debug"` so it can be
installed side by side with the Capacitor app (`app.hodora.mobile`) on the
same device while both are being developed.

## What's left

**Phase 3 (navigation)** has already been through one round of real-device
fixes this project's git history covers (map rendering, camera/follow
behavior). What's still unconfirmed there is longer-running behavior
nothing in this environment can substitute for: a real device, screen off,
app backgrounded, ideally tested on an OEM with aggressive battery
management (Samsung/Xiaomi are the usual troublemakers) in addition to
stock/Pixel —

- The foreground service actually survives Doze/App Standby over a
  realistic ride length, not just a few minutes of active testing.
- TTS announcements are audible, correctly timed relative to real cycling
  speed, and don't overlap awkwardly with rain/proximity alert speech.
- The battery and mobile-data cost of a live nav session (GPS every 2s,
  periodic weather/rejoin fetches) is acceptable in practice.
- The permission flow (foreground → background location → battery
  exemption) reads sensibly against the real system dialogs it triggers,
  not just the in-app rationale text.

**Phases 4-6 need their first real-device pass entirely** — everything in
them is written against API knowledge, not verified against an actual
Gradle build (this environment has no Android SDK/Maven access; see the
plan doc's status banner). Particularly worth checking first:

- Recording (Phase 4): does `RecordingService` actually survive
  backgrounding/screen-lock the same way navigation does, and does pause/
  resume produce sane elapsed-time/distance numbers?
- Offline (Phase 5): does the `data:` URI style-loading trick in
  `offline/OfflineMaps.kt` actually work against a real Maven-resolved
  MapLibre build — this is the single most likely thing to be wrong, see
  that file's doc comment.
- Cloud sync (Phase 6): does `auth.currentAccessTokenOrNull()` in
  `CloudSyncRepository.kt` resolve against whatever supabase-kt version
  Gradle actually pulls in.

## Project layout

```text
app/src/main/java/app/hodora/mobile/
  HodoraApplication.kt   # MapLibre.getInstance(this) + OfflineStore.init(this)
  MainActivity.kt        # Also handles the hodora.app/share/{id} App Link
  gpx/
    Gpx.kt               # Full port of src/lib/gpx.ts
  cues/
    Cues.kt              # Full port of src/lib/cues.ts
  routing/
    Routing.kt           # Full port of src/lib/routing.ts (BRouter/OSRM client)
  discover/
    Discover.kt          # Port of src/lib/discover.ts (Overpass lookup + generated loops)
  wind/
    WindScore.kt          # Port of src/lib/windScore.ts (route wind scoring)
  share/
    SharedRide.kt          # Client for the public GET /api/share/{token}
  nav/
    Nav.kt                # Full port of src/lib/nav.ts (turn detection, snap-to-route, ...)
    NavigationService.kt  # Foreground service: location, notification, TTS — the flagship feature
    NavState.kt            # Shared StateFlow between the service and NavScreen
    VoiceAnnouncer.kt       # Native TextToSpeech, port of src/lib/voice.ts's threshold logic
  record/
    Record.kt                 # Port of src/lib/record.ts (GPS-jitter filtering)
    RecordingService.kt       # Foreground service for ride recording — separate from NavigationService
    RecordState.kt             # Shared StateFlow between the service and RecordScreen
  weather/
    Weather.kt            # Partial port of src/lib/weather.ts (current + hourly forecast, rain alerts)
  offline/
    OfflineMaps.kt        # MapLibre OfflineManager wrapper — downloadable map tiles
  net/
    HttpClientProvider.kt # Shared Ktor client for BRouter/OSRM/Open-Meteo (non-Supabase calls)
  data/
    model/         # Kotlin data classes mirroring supabase/migrations/ tables (Ride, RideNote, ...)
    repository/     # Auth + Postgrest + cloud-sync access, one repository per concern
    supabase/        # The shared SupabaseClient (SupabaseModule.kt)
    local/            # Room-backed offline cache (OfflineStore.kt and friends)
  ui/
    auth/            # Sign in / sign up / reset password
    rides/           # Rides list + GPX import
    ridedetail/       # Route map, elevation profile, GPX export, save-for-offline
    plan/              # Route planner — tap-to-plan, BRouter/OSRM, save
    nav/                # NavScreen — permission flow + turn-by-turn UI
    record/              # RecordScreen — start/pause/resume/finish + save
    explore/              # ExploreScreen — Overpass routes + generated loops
    wind/                  # WindScreen — current-conditions wind scoring for a ride
    share/                  # SharedRideScreen — the public share-link viewer
    cloud/                   # CloudSyncScreen — Google Drive/OneDrive/Nextcloud
    map/               # RouteMapView + PlanMapView (MapLibre Native) + the CARTO raster style
    permissions/       # Shared background-location checklist + one-shot current-location fix
    navigation/       # HodoraNavHost — routes on Supabase session state + the share App Link
    theme/            # Material 3 theme using Hodora's racing-green brand color
```

## Porting business logic from the web app

`src/lib/*.ts` at the repo root (GPX parsing, navigation math, routing,
weather, offline storage) has no server dependency and needs a straight
Kotlin port — see the table in
[docs/NATIVE_ANDROID_PLAN.md](../docs/NATIVE_ANDROID_PLAN.md#what-stays-what-gets-rebuilt).
Each of those modules already has a `*.test.ts` file; port the test cases
first as JUnit tests before porting the implementation, so a wrong Kotlin
port fails a test immediately instead of showing up later as a wrong
turn-by-turn cue mid-ride.
