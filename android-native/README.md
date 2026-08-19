# Hodora — native Android app

This is a from-scratch native Android app (Kotlin + Jetpack Compose), built
alongside — not replacing — `android/` (the Capacitor WebView shell). See
**[docs/NATIVE_ANDROID_PLAN.md](../docs/NATIVE_ANDROID_PLAN.md)** at the repo
root for why this exists (short version: background turn-by-turn navigation
is structurally impossible in a WebView — mobile browsers throttle
`geolocation.watchPosition()` the moment the screen locks) and the full
phased roadmap.

## Status: Phases 0-3 — scaffold, map + ride detail, route planning, background navigation

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
- Nav host (`ui/navigation/HodoraNavHost.kt`) that switches between the auth
  screen, rides list, ride detail, the planner, and navigation based on
  Supabase session state and navigation.

What's deliberately **not** here yet (see the plan doc's phases): offline
storage, reopening a saved planned route to edit it, and
weather-at-departure on the planner. Phase 3's code is done; what's left is
real-device validation — see "What's left in Phase 3" below.

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

## What's left in Phase 3

Every gap from the previous round (rain/wind alerts, proximity alerts on
ride notes, a live position marker, the placeholder notification icon) is
now built. What's left isn't code — it's validation nothing in this
environment can substitute for: a real device, screen off, app
backgrounded, ideally tested on an OEM with aggressive battery management
(Samsung/Xiaomi are the usual troublemakers) in addition to stock/Pixel.
That's the only way to confirm:

- The foreground service actually survives Doze/App Standby over a
  realistic ride length, not just a few minutes of active testing.
- TTS announcements are audible, correctly timed relative to real cycling
  speed, and don't overlap awkwardly with rain/proximity alert speech.
- The battery and mobile-data cost of a live nav session (GPS every 2s,
  periodic weather/rejoin fetches) is acceptable in practice.
- The permission flow (foreground → background location → battery
  exemption) reads sensibly against the real system dialogs it triggers,
  not just the in-app rationale text.

## Project layout

```text
app/src/main/java/app/hodora/mobile/
  HodoraApplication.kt   # Also where MapLibre.getInstance(this) is called
  MainActivity.kt
  gpx/
    Gpx.kt               # Full port of src/lib/gpx.ts
  cues/
    Cues.kt              # Full port of src/lib/cues.ts
  routing/
    Routing.kt           # Full port of src/lib/routing.ts (BRouter/OSRM client)
  nav/
    Nav.kt                # Full port of src/lib/nav.ts (turn detection, snap-to-route, ...)
    NavigationService.kt  # Foreground service: location, notification, TTS — the flagship feature
    NavState.kt            # Shared StateFlow between the service and NavScreen
    VoiceAnnouncer.kt       # Native TextToSpeech, port of src/lib/voice.ts's threshold logic
  weather/
    Weather.kt            # Partial port of src/lib/weather.ts (current + hourly forecast, rain alerts)
  net/
    HttpClientProvider.kt # Shared Ktor client for BRouter/OSRM/Open-Meteo (non-Supabase calls)
  data/
    model/         # Kotlin data classes mirroring supabase/migrations/ tables (Ride, RideNote, ...)
    repository/     # Auth + Postgrest access, one repository per concern
    supabase/        # The shared SupabaseClient (SupabaseModule.kt)
  ui/
    auth/            # Sign in / sign up / reset password
    rides/           # Rides list + GPX import
    ridedetail/       # Route map, elevation profile, GPX export
    plan/              # Route planner — tap-to-plan, BRouter/OSRM, save
    nav/                # NavScreen — permission flow + turn-by-turn UI
    map/               # RouteMapView + PlanMapView (MapLibre Native) + the CARTO raster style
    navigation/       # HodoraNavHost — routes on Supabase session state
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
