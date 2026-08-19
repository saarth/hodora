# Native Android app — plan

> **Status:** Phases 0-3 have landed at [`android-native/`](../android-native/)
> — Gradle/Compose skeleton, Supabase auth, a rides list with GPX import, a
> ride detail screen (MapLibre route map, elevation profile, GPX export), a
> route planner (tap-to-plan, BRouter/OSRM routing, save to rides), and
> background turn-by-turn navigation (a foreground `NavigationService`,
> persistent notification, native TTS, background-location and
> battery-optimization permission flow). See that folder's README for what's
> there, how to build it, and what's still missing before it's ride-worthy.
> Phases 4+ below are still to do.

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
battery-optimization exemption prompt before starting.

**Still needed before this is ride-worthy** (validating any of this needs a
real device — screen off, app backgrounded, ideally on an OEM with
aggressive battery management like Samsung/Xiaomi in addition to stock/Pixel,
since none of this can be verified by automated tooling): off-route
re-routing (currently only flags `offRoute`, doesn't draw a path back —
`rejoin.ts` isn't ported); rain/wind alerts and proximity alerts on ride
notes (both need modules/columns not ported yet — `weather.ts`, ride
`notes`); a live position marker on the nav map (it currently shows the
route only, for orientation); and the map-reload performance issue flagged
in a comment on `NavRunningContent` (it currently reloads the whole MapLibre
style on every ~2s location tick — fine for proving the pipeline works, not
fine for a real ride's battery/data usage).

**Phase 4 — ride recording**
Port `record.ts`, wire it to the same foreground service from Phase 3 so a
recorded ride also survives a locked screen.

**Phase 5 — offline**
Room cache for rides/profile, MapLibre `OfflineManager` region downloads
replacing `offline-tiles.ts`. This is where "offline maps and routes" from
the README's feature list becomes more capable than the PWA version, not
just equivalent to it.

**Phase 6 — Explore, Wind, sharing, cloud sync**
Port `discover.ts` (Explore loop generator) and `windScore.ts` (Wind page),
add the shared-link deep link (`/share/$id` → an Android App Link on
`hodora.app`), and wire cloud sync per the OAuth approach above.

**Phase 7 — cutover**
Once Phase 3–6 reach feature parity with the Capacitor build, retire
`android/` (the Capacitor project) and `capacitor.config.ts`, and update
`README.md`'s "Android app (Capacitor)" section to describe the native app
instead. Until then, ship the native app as a parallel/beta track (a
separate internal-testing track on Play, or a second GitHub release asset
for the existing Obtainium-based distribution) so the WebView build keeps
working for existing installs while the native app is validated.

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
