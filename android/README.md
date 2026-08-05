# Hodora Android (Phase 1)

Native Kotlin/Jetpack Compose Android app — the offline-first core of Hodora:
import a GPX route, view it on a map with an elevation profile, save it for
offline use, and get turn-by-turn navigation that keeps running via a real
foreground service even with the screen off. No sign-in yet — everything is
stored locally (see `../.claude/plans` for the phased plan; auth/cloud sync
and "explore nearby routes" are Phase 2/3, not built here).

This was written without a local Android SDK/JDK available to compile-check
it, so **the first thing to do is open it in Android Studio and let it sync**
— that's the real verification step.

## Build & run

1. Install [Android Studio](https://developer.android.com/studio) (Ladybug or
   newer). It bundles a JDK, so you don't need to install Java separately.
2. Open the `android/` folder as a project (not the repo root).
3. Let Gradle sync — it'll download dependencies on first run. If it
   complains about the Gradle version, let it re-download the wrapper
   (`gradle-wrapper.jar` is already committed, but Android Studio may want to
   verify/replace it).
4. Run on a device or emulator (▶ button). **Use a real device for GPS
   testing** — the emulator's simulated location is fine for UI checks but
   won't exercise turn-by-turn navigation realistically.

## What to try first

1. Import a real GPX file (via the "Import GPX" button, or by sharing a
   `.gpx` file from another app — Hodora registers as a viewer for GPX
   files).
2. Open the ride: check the map renders, the elevation chart matches, and
   distance/ascent/descent look right.
3. Tap "Download" on the offline card, then turn on airplane mode and
   confirm the map and route still load.
4. Start navigation, walk/drive the route (or a GPS-mocking tool), and check
   turn prompts, the off-route banner (deviate >40m), and the finish screen
   (within 20m of the end). Lock the screen mid-navigation and confirm the
   notification keeps updating.

## Known gaps (by design, this pass)

- No account/sign-in, no cloud sync — everything is local (Room).
- No "Explore nearby routes" screen.
- No rejoin-routing line when off-route (just the off-route banner) — the
  web app's OSRM/BRouter rejoin path is a Phase 3 item.
- Dependency versions in `gradle/libs.versions.toml` were picked from what's
  published on Maven Central as of writing, not verified against a real
  build — Android Studio's sync will flag anything stale.
