# Hodora — native Android app

This is a from-scratch native Android app (Kotlin + Jetpack Compose), built
alongside — not replacing — `android/` (the Capacitor WebView shell). See
**[docs/NATIVE_ANDROID_PLAN.md](../docs/NATIVE_ANDROID_PLAN.md)** at the repo
root for why this exists (short version: background turn-by-turn navigation
is structurally impossible in a WebView — mobile browsers throttle
`geolocation.watchPosition()` the moment the screen locks) and the full
phased roadmap.

## Status: Phase 0 — scaffold

What's here so far:

- Project skeleton: Gradle Kotlin DSL + version catalog
  (`gradle/libs.versions.toml`), Jetpack Compose, Material 3.
- Supabase auth (`data/repository/AuthRepository.kt`) — sign in, sign up,
  password reset, sign out — against the **same Supabase project** the web
  app uses.
- A rides list screen (`ui/rides/`) reading from the `rides` table via
  Postgrest, scoped by Row Level Security exactly like the web client (no
  server code needed or duplicated).
- Nav host (`ui/navigation/HodoraNavHost.kt`) that switches between the auth
  screen and the rides list based on Supabase session state.

What's deliberately **not** here yet (see the plan doc's phases): maps, GPX
import, route planning, offline storage, and — the actual point of building
this — background turn-by-turn navigation with a foreground service.

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

## Project layout

```text
app/src/main/java/app/hodora/mobile/
  HodoraApplication.kt
  MainActivity.kt
  data/
    model/         # Kotlin data classes mirroring supabase/migrations/ tables
    repository/     # Auth + Postgrest access, one repository per concern
    supabase/        # The shared SupabaseClient (SupabaseModule.kt)
  ui/
    auth/            # Sign in / sign up / reset password
    rides/           # Rides list
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
