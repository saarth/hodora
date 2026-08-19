# Native Android app — plan

> **Status:** Phases 0-6 have landed at [`android-native/`](../android-native/)
> — Gradle/Compose skeleton, Supabase auth, a rides list with GPX import, a
> ride detail screen (MapLibre route map, elevation profile, GPX export), a
> route planner (tap-to-plan, BRouter/OSRM routing, save to rides),
> background turn-by-turn navigation (a foreground `NavigationService`,
> persistent notification, native TTS, background-location and
> battery-optimization permission flow, off-route re-routing, rain/wind
> alerts, proximity alerts on ride notes, a live heading-arrow position
> marker, and a real status-bar icon), ride recording (`RecordingService`,
> the same foreground-service pattern as navigation), an offline ride cache
> (Room) plus downloadable map tiles (MapLibre's `OfflineManager`), and
> Explore/Wind/shared-route-links/cloud sync. See that folder's README for
> what's there and how to build it.
>
> **Phases 0-3 got real-device fixes from actual Android Studio builds**
> (map rendering, camera behavior, background nav) — see the git history on
> `android-native/`. **Phases 4-6 have not been run on a device at all yet**
> and are exactly the kind of "written correct as far as static reading can
> tell, but genuinely unverified" code the earlier phases started out as too
> — expect a similar round of real-build fixes before trusting any of it.
> **Phase 7 (retiring `android/`, the Capacitor project) is a deliberate
> stop, not a remaining task list** — see that section below for why.

## Why

`android/` today is a [Capacitor](https://capacitorjs.com/) shell: a
`MainActivity` with one `WebView` pointed at `https://hodora.app`. It gets a
real launcher icon, splash screen, status bar theming and the hardware back
button, but every feature is still the web app running in a browser engine.
As `AGENTS.md` already documents, that has a real ceiling: navigation,
voice announcements, rain alerts and proximity alerts all run on the
foreground `navigator.geolocation.watchPosition()` stream, which mobile
Chrome throttles or kills the moment the screen locks or the app is
backgrounded. A rider who puts the phone in a jersey pocket mid-ride loses
guidance. That's the actual reason to go native — not "WebView bad", but
*this specific class of bug is structurally unfixable inside a WebView* and
needs a foreground `Service`, a persistent notification, and
background-location permission handling that only a native process can do.

"True native" here means: a Kotlin app built on the Android SDK / Jetpack
directly (not another wrapper — no React Native, no Flutter, no Capacitor),
talking to the *same* Supabase backend and the *same* public routing/weather
APIs the web app already uses, so there is one source of truth for rides and
one set of server routes for anything that has to stay server-side (account
deletion, OAuth token exchange for cloud sync).

## What stays, what gets rebuilt

**Stays exactly as-is (no server changes needed):**
- Supabase Postgres schema (`profiles`, `rides`, `cloud_connections`,
  `ride_sync_state`, `shared_links`) and its RLS policies — the native app
  authenticates as the same Supabase user and reads/writes through the same
  tables PostgREST already exposes.
- `src/routes/api/delete-account.tsx` and all of `src/routes/api/cloud/**` —
  account deletion and the Nextcloud/Google Drive/OneDrive OAuth dance need
  the service-role key and provider client secrets, which must never ship
  inside an APK. The native app calls these exactly like the web app does
  (see "Cloud sync" below for the OAuth redirect wrinkle).
- BRouter/OSRM (`VITE_BROUTER_URL`) and Open-Meteo — both are plain public
  REST APIs already called client-side; a native HTTP client hits the same
  URLs.
- The `cycling-style.ts` MapLibre style, if `VITE_MAPTILER_KEY` is set — it's
  already a MapLibre style-spec JSON document, and MapLibre Native (the
  Android SDK) consumes the same spec format as MapLibre GL JS. Point the
  Android map at the same style URL/JSON; no porting needed.

**Gets rebuilt in Kotlin (the actual work):**
- Every screen (`src/routes/*.tsx`) as Jetpack Compose.
- The business-logic layer under `src/lib/` — GPX parsing, navigation math,
  offline storage, and route/weather clients have no server dependency, so
  they need a straight port, not a redesign:

  | Web module | Lines | Kotlin equivalent |
  |---|---|---|
  | `src/lib/gpx.ts` | 377 | GPX parse/serialize |
  | `src/lib/nav.ts` | 308 | turn detection, snap-to-route, cue state machine |
  | `src/lib/routing.ts` | 187 | BRouter/OSRM HTTP client |
  | `src/lib/rides.ts` | 420 | rides CRUD against PostgREST |
  | `src/lib/weather.ts` | 370 | Open-Meteo client, headwind/tailwind calc |
  | `src/lib/windScore.ts`, `cues.ts`, `cue-recovery.ts`, `discover.ts`, `rejoin.ts`, `record.ts` | — | pure/near-pure algorithms |
  | `src/lib/offline-db.ts`, `offline-tiles.ts` (IndexedDB) | 147 + 174 | Room (rides/profile cache) + MapLibre Native's built-in `OfflineManager` (tile packs) |

  Every one of these already has a `*.test.ts` file
  (`gpx.test.ts`, `nav.test.ts`, `windScore.test.ts`, `cues.test.ts`,
  `weather.test.ts`, `record.test.ts`, `offline-db.test.ts`,
  `offline-tiles.test.ts`) — treat those as golden fixtures. Port the test
  cases first, get them passing in Kotlin, and you know the port is correct
  before any UI is built on top of it.

## Recommended stack

- **Language/UI:** Kotlin + Jetpack Compose + Material 3. Plain
  Android/Jetpack, not Kotlin Multiplatform — nobody's asked for iOS, and KMP
  adds build complexity that isn't worth paying for a single-platform app.
  (If iOS ever becomes a goal, the ported business-logic module below is the
  part worth moving into a `commonMain` KMP module at that point — not now.)
- **Maps:** [MapLibre Native for Android](https://github.com/maplibre/maplibre-native)
  (`org.maplibre.gl:android-sdk`) — same rendering engine family as the web
  app's MapLibre GL JS, same style-spec format, and it ships a real
  `OfflineManager` for downloading map regions, which is strictly better
  than the hand-rolled IndexedDB tile cache in `offline-tiles.ts`.
- **Auth + data:** [supabase-kt](https://github.com/supabase-community/supabase-kt)
  (`Auth`, `Postgrest`, `Storage` modules) — same Supabase project, same
  RLS-scoped `auth.uid()` access the web client already relies on. Session
  persisted via `DataStore`/`EncryptedSharedPreferences`, not a WebView
  cookie jar.
- **Offline cache:** Room, mirroring the `rides` table shape (`points` as a
  JSON column, same as Postgres) plus a small sync/dirty-flag column for
  offline-created rides.
- **Networking:** Ktor client (pairs naturally with supabase-kt) for BRouter/
  OSRM/Open-Meteo and for the existing `/api/cloud/**`, `/api/delete-account`
  server routes.
- **Location:** `FusedLocationProviderClient` (Play Services) for the actual
  GPS stream — better accuracy and power behavior than the WebView's
  `navigator.geolocation`.
- **Background navigation (the whole point):** a
  `LocationForegroundService` (`FOREGROUND_SERVICE_LOCATION` type, Android 14
  manifest requirement) holding the `watchPosition`-equivalent location
  stream + nav state machine, driving:
  - an ongoing `NotificationCompat` notification with next-turn text/
    distance, updated as the ride progresses;
  - Android's native `TextToSpeech` for voice cues (replacing `voice.ts`'s
    Web Speech API — same feature, works with the screen off);
  - a request for `ACCESS_BACKGROUND_LOCATION` ("Allow all the time") with
    clear in-app rationale UI before the system prompt, since Android 11+
    rejects requesting it in the same step as foreground location;
  - an `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` prompt (optional,
    clearly explained, never forced) so OEM battery managers don't kill the
    service mid-ride.
- **Background sync:** `WorkManager` for periodic cloud-connection sync and
  offline tile prefetch, replacing nothing that exists today (this is new —
  the web app only syncs on-demand).

## Cloud sync OAuth, without shipping secrets in the APK

Google Drive and OneDrive connections are OAuth with a client secret that
must stay server-side (`GOOGLE_DRIVE_CLIENT_SECRET`, `ONEDRIVE_CLIENT_SECRET`
in the deployed backend). Don't reimplement the OAuth token exchange in the
app. Instead:

1. App opens `https://hodora.app/api/cloud/google-drive/authorize` (or
   onedrive) in a Custom Tab.
2. The existing server route runs the same flow it runs for web users.
3. Change the callback route's success redirect to a custom URI scheme
   (e.g. `hodora://cloud-callback`) *when the request came from the app* —
   add an `?app=1` query param the app sets on the authorize URL, and have
   `.../callback.tsx` redirect there instead of back to `/settings` when
   present. Register that scheme as an `<intent-filter>` on an activity in
   the Android app to catch the redirect and close the Custom Tab.
4. App then calls `.../status` exactly like the web client does.

Nextcloud stays simple either way — it's just a server URL + app password
form, no redirect needed.

## Phased roadmap

Ship each phase as something that actually works, rather than one long
native rewrite with nothing usable until the end.

**Phase 0 — project scaffold (done, see `android-native/`)**
New Android Studio project, Kotlin + Compose, same `applicationId`
(`app.hodora.mobile`) so this can eventually replace the Capacitor build
under the same Play listing. Wire up supabase-kt auth (sign in/up/reset —
mirrors `src/routes/auth.tsx`, `reset-password.tsx`) and a rides list screen
reading straight from PostgREST. No maps, no offline, no background service
yet — just prove the auth + data plumbing.

**Phase 1 — map + ride detail (done, see `android-native/`)**
MapLibre Native map view, ride detail screen (route line, elevation profile —
built as a plain Compose `Canvas` rather than pulling in a charting library,
since one area chart doesn't justify the dependency), GPX import/export via
the system file picker (Storage Access Framework). `gpx.ts` is ported in
full (`gpx/Gpx.kt`); `rides.ts` is ported just enough to list, fetch, and
create rides — no notes/tags/cues/re-planning yet, those come with the
screens that use them.

**Phase 2 — route planning (done, see `android-native/`)**
Port of `routing.ts` (BRouter/OSRM client, straight-line fallback) and the
waypoint/routing/save logic in `src/routes/plan.tsx` — tap the map to add a
waypoint, reroute through BRouter (preferred, profile-aware) falling back to
OSRM then a straight line, save to `rides` with `plan_waypoints`/
`plan_profile`/`cues` populated so the route is re-plannable later (reopening
a saved route in the planner to edit it isn't wired up yet — the planner
only creates new rides so far). Not ported: the weather-at-departure panel
(needs `weather.ts`) and reopening an existing planned route for editing.
No offline yet — this hits the network every time, same as web.

**Phase 3 — the flagship feature: background turn-by-turn navigation (done, see `android-native/`)**
`nav/NavigationService.kt` — a foreground `Service` (`foregroundServiceType="location"`)
that keeps snapping position to the route, updating a persistent notification,
and speaking cues via native `TextToSpeech` (`nav/VoiceAnnouncer.kt`) after
the rider locks the screen or backgrounds the app. `nav/Nav.kt` is a full
port of `nav.ts` (turn detection, snap-to-route, compass/grade/wind math);
`cues.ts` is now fully ported (`buildCueSheet`, `cueText`, the
geometry-detected-turns fallback) so navigation has instructions whether or
not the route came with router-provided ones. `ui/nav/NavScreen.kt` walks
through the background-location permission flow (a separate, later step
from foreground location, per Android 10+'s requirement) and an optional
battery-optimization exemption prompt before starting. `rejoin.ts` is now
ported too (`NavigationService.maybeRejoin`, throttled the same way
`useRejoinRoute` is on web) — going off-route fetches a bike-friendly path
back to the track via BRouter/OSRM, falling back to a straight line, and
`RouteMapView`/`NavScreen` draw it the same way `RouteMap.tsx` does (solid
when routed, dashed for the straight-line fallback).

`RouteMapView`/`PlanMapView` no longer rebuild their whole MapLibre style on
every recomposition either — they build it once and mutate the existing
GeoJsonSources in place afterward, so the nav map's ~2s location-tick
recompositions no longer reload basemap tiles or re-fit the camera. The map
also now shows a live, heading-rotated position arrow (`buildArrowBitmap` in
`RouteMapView.kt`), falling back to the route's own direction of travel
(`routeBearing`) when GPS bearing is unavailable, which is often at cycling
speed.

`weather/Weather.kt` is a partial port of `weather.ts` — `fetchWeather`,
`fetchHourlyWind`, `findRainAlert` (not the departure-weather day/hour
picker helpers, which belong to `/plan`'s weather panel, a Phase 2 gap).
`NavigationService` refreshes current conditions and the hourly forecast on
the same move/staleness throttle `useWeather` uses on web, drives a live
headwind/tailwind readout (`routeBearing` + `windRelativeAngle`/`windEffect`
from `nav/Nav.kt`) shown on `NavScreen`, and raises a one-shot snackbar (via
`NavState.rainAlert`) when `findRainAlert` crosses its thresholds. Ride
`notes` are modeled now too (`data/model/Ride.kt`'s `RideNote`,
`RidesRepository`'s `RIDE_COLUMNS`), so `NavigationService.checkProximityAlert`
can alert (snackbar + optional voice) as the rider passes one, using the
same `findProximityAlert` from `nav/Nav.kt` nav.ts always had. The
notification's small icon is a real hand-drawn vector glyph now too
(`res/drawable/ic_stat_navigation.xml`), not the `android.R` system
placeholder.

**What's left before this is ride-worthy**: none of it is code — it's
validation on a real device (screen off, app backgrounded, ideally on an OEM
with aggressive battery management like Samsung/Xiaomi in addition to
stock/Pixel), which nothing in this environment can substitute for. That
covers whether the foreground service actually survives Doze/App Standby,
whether TTS announcements are audible and correctly timed relative to a real
ride's speed, and whether the battery/data cost of a live nav session is
acceptable in practice.

**Phase 4 — ride recording (done, see `android-native/`)**
`record/Record.kt` ports `record.ts`'s `acceptRecordingFix` (GPS-jitter
filtering). `record/RecordingService.kt` is a *separate* foreground Service
from `NavigationService` — deliberately not a reuse of it, since recording's
plain start/pause/resume/finish state machine over a live GPS track shares
nothing with nav's route-snapping/cues/rejoin/weather logic beyond the
foreground-service/notification/`FusedLocationProviderClient` mechanics,
which is what "the same foreground service" in this phase's original
one-liner actually meant. `ui/record/RecordScreen.kt` reuses the same
background-location permission checklist navigation does (now factored out
to `ui/permissions/BackgroundLocationChecklist.kt` so neither screen
duplicates it) and `RouteMapView`'s follow-mode/recenter-button map. Saving
calls `buildParsedRide` + `RidesRepository.createRide(isRecorded = true)`
directly once stopped — no service round-trip needed by then.

**Phase 5 — offline (done, see `android-native/`)**
`data/local/OfflineStore.kt` is the Room equivalent of `offline-db.ts`'s
IndexedDB store — rides cached as their own serialized JSON (Room's flat
schema doesn't map cleanly onto `Ride`'s nested points/cues/notes, so a
JSON blob keyed by id is the direct equivalent of the IndexedDB object
store, which does the same thing), plus a cached ride-list snapshot.
`RidesRepository.listRides()`/`getRide()` fall back to it on any network
failure. Map tiles use MapLibre Native's built-in `OfflineManager`
(`offline/OfflineMaps.kt`) instead of a straight port of
`offline-tiles.ts`'s hand-rolled tile-URL math, per this phase's original
note that `OfflineManager` is strictly more capable. One flagged
assumption in that file: `OfflineTilePyramidRegionDefinition` needs a
resolvable style URL, and `CartoStyle.kt` only builds inline JSON, so
downloads go against a `data:` URI encoding of it — untested against a
real Maven-resolved build. `RideDetailScreen` gained a "Save for offline"
action driving both pieces together. Not carried over: a cached user
Profile (no profile/settings screen exists yet in the native app to hang
one off of).

**Phase 6 — Explore, Wind, sharing, cloud sync (done, see `android-native/`)**
`discover/Discover.kt` ports `discover.ts` (Overpass lookup + generated
loops via `fetchRoute`) for `ui/explore/`; Kotlin's structured concurrency
cancels in-flight per-bearing route requests for free, so there's no
`AbortSignal` plumbing to port. `wind/WindScore.kt` is a direct port of
`windScore.ts` built on `nav/Nav.kt`'s existing wind primitives;
`ui/wind/WindScreen.kt` is intentionally simplified to current-conditions
scoring only, not `wind.tsx`'s multi-day/hour forecast picker (that needs
`weather.ts`'s day-grouping helpers, which `weather/Weather.kt`'s own doc
comment already flags as not ported). `share/SharedRide.kt` hits the same
public `GET /api/share/{token}` the web share page uses; `MainActivity`
handles the `https://hodora.app/share/{id}` App Link (needs a real
`assetlinks.json` deployed server-side for Android to auto-verify it,
which is outside this module) and routes straight to `SharedRideScreen`,
bypassing the sign-in gate the same way the web share page is public.
`data/repository/CloudSyncRepository.kt` connects Google Drive/OneDrive/
Nextcloud against the existing `src/routes/api/cloud/**` server routes —
turned out these already authenticate via a plain `Authorization: Bearer
<jwt>` header (`api-auth.server.ts`), not the cookie session this plan
originally assumed, so the native app calls them directly with its
existing Supabase access token. **Deliberately not wired up**: the
seamless in-app OAuth return (a `hodora://cloud-callback` custom-scheme
redirect) described below — it needs `authorize.tsx`/`callback.tsx`
changes to thread an "opened from the app" hint through the signed `state`
param, which touches live OAuth token-exchange code serving existing web
users, and felt like a decision worth surfacing rather than making
silently mid-implementation. Today, Google Drive/OneDrive connect opens
the consent screen in the system browser and the rider switches back to
Hodora manually; Nextcloud (server URL + app password, no redirect at all)
has no such gap.

**Phase 7 — cutover: a deliberate stop, not a remaining task**
This phase means deleting `android/` (the Capacitor project) and its Play
Store/Obtainium distribution — an existing, shipping app's only update
path for real installs. Its own precondition ("once Phase 3–6 reach
feature parity with the Capacitor build **and are validated**") isn't met:
Phases 4–6 above have had zero real-device testing, and known gaps exist
against the web app on purpose (place search in Explore, the wind
forecast's day/hour picker, seamless cloud-sync OAuth return, offline
Profile caching, ported `*.test.ts` unit test coverage — see each phase's
notes above). Retiring the Capacitor build before that would leave
existing users with either no working app or a native build that hasn't
been proven on a real phone. Treat this phase as blocked on: (1) the same
real-device validation round Phases 0–3 already went through, run against
Phases 4–6, and (2) an explicit decision, not an inferred one, since it's
irreversible for whoever's still on the Capacitor build when it happens.

## New manifest permissions needed

On top of what `android/app/src/main/AndroidManifest.xml` already declares
(`INTERNET`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `WAKE_LOCK`),
the native app additionally needs:

```xml
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

`ACCESS_BACKGROUND_LOCATION` triggers Play Console's background location
review — budget time for that when planning a Play Store release, and write
the in-app rationale screen before submitting (Play requires it to be
visible, not just present in code).

## Testing strategy

- Port each `src/lib/*.test.ts` file's cases into a Kotlin unit test
  (JUnit) alongside the ported module, using the same fixtures/expected
  values — this catches porting bugs immediately rather than after they show
  up as wrong turn-by-turn cues on a real ride.
- `nav.ts`/`gpx.ts` are explicitly called out in `AGENTS.md` as having no
  automated tests beyond the unit tests and needing manual verification with
  real GPX files — keep doing that for the Kotlin port too, it's not
  optional just because the language changed.
- Background-service behavior (Phase 3) cannot be verified by any automated
  tooling in this environment — it needs a real device, screen off, app
  backgrounded, across at least one OEM with aggressive battery management
  (Samsung/Xiaomi are the usual troublemakers) in addition to stock/Pixel.

## Effort note

This is a real rewrite, not a wrapper swap — roughly 2,000 lines of business
logic to port plus every screen rebuilt in Compose. Given the README notes
this is a solo, learn-as-you-go project, Phases 0–2 are a reasonable
"prove it's viable" milestone on their own, and Phase 3 (background nav) is
the phase that actually justifies the effort — it's worth reaching that
milestone even if Phases 5–6 (offline, cloud sync) take much longer or stay
on the web/Capacitor build for longer.
