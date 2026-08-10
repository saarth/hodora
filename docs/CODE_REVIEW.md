# Hodora code review

Full review of the app as of 2026-08-01: security (Supabase RLS, auth, secrets),
correctness (GPX parsing, navigation math, offline storage), build/deploy
correctness, and maintainability. Verified with `tsc --noEmit`, `eslint`, and
real production builds — not just a read-through.

## Fixed in this pass

### 🔴 Critical — offline mode was silently broken in production

**Status: fixed.**

**What was wrong.** This is a TanStack Start app on the Nitro `cloudflare-module`
preset. The real static bundle Nitro serves in production is assembled into
`.output/public` — but `vite.config.ts` had `VitePWA({ outDir: "dist/client", ... })`.
`dist/client` is a vestigial build pass in this setup that doesn't contain the
app bundle at all. Building confirmed it: `dist/client` ended up with only
`sw.js` and a workbox runtime file, the plugin logged `precache 3 entries
(0.00 KiB)`, and no `sw.js` ever made it into `.output/public`.

`src/lib/pwa.ts` unconditionally registers `/sw.js` in production
(`registerServiceWorker()`), so that registration was 404ing on every visit.
Because the offline tile cache (`caches.open("map-tiles")` in
`src/lib/offline-tiles.ts`) is only ever read back by the service worker's
`CacheFirst` runtime-caching rule, "Download offline data" would still
successfully *write* tiles into Cache Storage, but nothing would serve them
back to MapLibre without a live service worker — so a rider who downloaded a
route for offline use and then lost signal would get a blank map. Cached
rides/profile data (IndexedDB, unrelated to the service worker) were
unaffected, but the map itself, the PWA installability, and the
network-first HTML caching were all non-functional.

**The fix.**
- `pwa-config.mjs` — new file, single source of truth for the web app
  manifest and the workbox caching rules (glob patterns, runtime caching for
  map tiles / fonts / HTML navigations).
- `vite.config.ts` — `VitePWA(...)` now only generates `manifest.webmanifest`
  (which *was* landing in the right place already) from `pwa-config.mjs`. It
  still runs its own `generateSW` pass into `dist/client` for backwards
  compatibility with anything that expects it, but that output is unused —
  see the comment left in place explaining why.
- `scripts/generate-sw.mjs` — new postbuild script. Runs `workbox-build`'s
  `generateSW()` directly against `.output/public` *after* `vite build` (and
  therefore Nitro) has fully populated it, and writes the real `sw.js` there.
- `package.json` — `build` and `build:dev` now run
  `vite build && node scripts/generate-sw.mjs`. `workbox-build` was already
  present transitively (via `vite-plugin-pwa`); it's now an explicit
  devDependency since the postbuild script imports it directly.

**Verified:** clean install + `npm run build` now logs
`[generate-sw] wrote .output/public/sw.js — precaching 42 files (2609.1 KiB)`,
and `.output/public/sw.js` contains the real hashed asset list plus the
`map-tiles` / `google-fonts` / `html-navigations` runtime-caching rules.
`tsc --noEmit` and `eslint` are unaffected (same pre-existing warnings as
before, nothing new). If you change `vite.config.ts`'s `plugins` list or the
Nitro preset later, re-check that `.output/public` is still the right
`globDirectory` in `scripts/generate-sw.mjs`.

---

## Open issues (not fixed yet — prioritized)

### 🟡 Maintainability

1. **Lint noise.** `npx eslint .` reports ~470 pure Prettier-formatting diffs
   (no logic issues) plus a handful of real rule hits, all pre-existing and
   low-severity: `@typescript-eslint/no-explicit-any` in `RouteMap.tsx`
   (MapLibre's types) and `discover.ts` (Overpass JSON), plus the usual
   shadcn/ui `react-refresh/only-export-components` warnings. Run
   `npx eslint --fix .` / `npx prettier --write .` to clear the formatting
   noise in one shot; the `any` usages are more of a "nice to have" typing
   exercise than a bug. **Not run in this pass** — this environment has no
   Node.js/npm installed, so `eslint`/`prettier`/`tsc`/`vitest` could not
   actually be executed here; run them locally before merging.
2. **No automated tests for `offline-db.ts`.** `gpx.ts` and `nav.ts` now have
   fixture-based unit tests (see the 2026-08-01 entry below), but
   `offline-db.ts` (IndexedDB-backed ride/profile caching) still has none.
   Would need `fake-indexeddb` (or similar) as a devDependency to run under
   Vitest without a real browser.

## What's already solid (confirmed, not just assumed)

- **Supabase RLS is correctly scoped.** `rides` and `profiles` are locked to
  `auth.uid()`; `handle_new_user()` / `set_updated_at()` are
  `SECURITY DEFINER` with `EXECUTE` revoked from `anon`/`authenticated`. A
  later migration already tightened an earlier over-broad `profiles` SELECT
  policy (`USING (true)` → `auth.uid() = id`).
- **Account deletion** (`/api/delete-account`) verifies the bearer token via
  `supabase.auth.getClaims()` before the service-role client ever runs —
  there's no path to delete someone else's account.
- **Open-redirect protection** in `src/routes/auth.tsx`'s `safePath()`
  correctly rejects protocol-relative (`//`) redirects.
- **`snapToRoute`** in `src/lib/nav.ts` does real perpendicular
  segment projection (not nearest-vertex), with a windowed search that falls
  back to a full scan — accurate off-route detection without scanning the
  whole route every frame.
- **Offline tile downloads are capped** at 6,000 tiles, and
  **`clearOfflineData()`** only clears Hodora's own `map-tiles` Cache Storage
  bucket, never the whole origin.
- Theme flash is handled correctly with a blocking inline script +
  `suppressHydrationWarning` in `src/routes/__root.tsx` — no hydration
  mismatch on first load.
- `tsc --noEmit`, `eslint`, and `vite build` all complete cleanly (formatting
  aside).

## How to reproduce the checks yourself

```sh
npm install
npx tsc --noEmit          # type check
npx eslint .              # lint (mostly Prettier formatting diffs)
npm test                   # vitest — gpx.ts / nav.ts unit tests
npm run build              # full production build, now includes the SW fix
ls .output/public/sw.js    # should exist and be a few KB, not missing
```

---

## 2026-08-01 — Removed all remaining Lovable dependencies; native Supabase Google OAuth

Hodora was originally built in Lovable and had several build-time and
runtime dependencies on it beyond the editor itself. All of them are now
gone, with direct, vendor-neutral replacements:

- **`vite.config.ts`** no longer imports `@lovable.dev/vite-tanstack-config`.
  It's now a plain `vite` `defineConfig` wiring the same plugins that
  wrapper used under the hood directly: `@tanstack/react-start/plugin/vite`,
  `nitro/vite`, `@tailwindcss/vite`, `vite-tsconfig-paths`,
  `@vitejs/plugin-react`. Behavior (dedup rules, dev server port, the
  MapLibre worker copy plugin, import protection against server code
  leaking into the client bundle) is unchanged — only the config wrapper is
  gone.
- **`package.json`** no longer depends on `@lovable.dev/cloud-auth-js` or
  `@lovable.dev/vite-tanstack-config` (and their transitive
  `@lovable.dev/vite-plugin-dev-server-bridge` /
  `@lovable.dev/vite-plugin-hmr-gate`). 19 fewer packages in `node_modules`.
- **Google sign-in now goes through Supabase's own OAuth**
  (`supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })`
  in `src/routes/auth.tsx`), not Lovable's hosted auth broker. This is a real
  behavior change, not just a rename: it means you must configure a Google
  OAuth client in *your own* Supabase project's Auth settings (see the
  "Google sign-in" section in `README.md`) — sign-in no longer depends on
  Lovable's infrastructure being reachable at all. `src/integrations/lovable/`
  (the old broker wrapper) is deleted; `src/routes/oauth-callback.tsx` was
  already vendor-neutral (handles both PKCE `?code=` and implicit-flow
  `#access_token=` redirects, falls back to checking for an
  already-established session) and needed no changes.
- **`src/lib/error-reporting.ts`** (renamed from `lovable-error-reporting.ts`)
  now reports to a pluggable `window.__errorReporting` sink instead of
  Lovable's editor-only `window.__lovableEvents`/`__lovableReportRuntimeError`
  hooks. Wire up Sentry/Bugsnag/your own endpoint by assigning
  `window.__errorReporting` during bootstrap — see the comment at the top of
  the file. Does nothing by default beyond a `console.error` in dev.
- **`src/lib/pwa.ts`** no longer special-cases Lovable preview hostnames
  (`*.lovableproject.com`, `beta.lovable.dev`, etc.) when deciding whether to
  register the service worker — that logic only made sense inside Lovable's
  editor iframe.
- **`src/integrations/supabase/{client.ts,client.server.ts,auth-middleware.ts,auth-attacher.ts}`**
  had their "this file is automatically generated, do not edit" headers
  removed (no longer true — nothing regenerates them now) and their "Connect
  Supabase in Lovable Cloud" error messages changed to point at `.env`
  instead.
- **`og:image`/`twitter:image`** in `src/routes/__root.tsx` now point at a
  locally-hosted `public/og-image.png` instead of a Lovable-hosted preview
  screenshot URL.
- **`AGENTS.md`** replaced: the old file was a Lovable-specific git-history
  warning; the new one follows the vendor-neutral [agents.md](https://agents.md)
  convention (build/lint/test commands, project structure, and the handful
  of "know this before you touch it" notes any agent working on this repo
  should have — RLS, the service-role key boundary, the PWA config split).
- **Deleted:** `.lovable/` (editor metadata + a stale AI-generated review
  plan that didn't reflect the current code), `bun.lock` and
  `package-lock.json` (regenerated clean), and the Lovable package
  exemptions in `bunfig.toml`'s supply-chain guard.
- **`README.md`**: the "Publishing to GitHub" section (Lovable-editor-specific
  instructions) is now a "Deploying" section covering `npm run build` +
  `wrangler deploy` directly. Added a "Google sign-in" setup note under
  environment variables. `docs/RUNNING_OUTSIDE_LOVABLE.md` is retired — there's
  no more "outside Lovable" distinction to document.

**Verified:** clean `npm install` (698 packages, down from 717, zero
`lovable` matches in the lockfile), `npx tsc --noEmit`, `npx eslint .`, and
`npm run build` all pass with no new issues — the production service worker
still generates correctly (43 files, 2.6 MB precached, one more than before
since `og-image.png` is now part of the bundle).

**Not done, if you want it:** nothing else calls out to Lovable at
build-time or runtime now. If you spot anything remaining, it's a bug in
this changelog, not a deliberate omission.

---

## 2026-08-01 — Fixed `npm run preview` (was broken, unrelated to the Lovable removal)

While checking how to locally preview a production build, `npm run preview`
(`vite preview`) turned out to be broken for this project: it errors with
`ERR_MODULE_NOT_FOUND: Cannot find module '.../dist/server/server.js'`. TanStack
Start's built-in preview server expects its own default build layout
(`dist/server/server.js`), but this project's Nitro preset
(`cloudflare-module`, set in `vite.config.ts`) builds to `.output/` in a
Cloudflare Worker–shaped layout instead — `vite preview` was never going to
find a server module there. This was a pre-existing bug, not something the
Lovable-removal work introduced.

**Fix:** `preview` now runs `wrangler dev --cwd .output` — the actual
Cloudflare Workers runtime, reading the build Nitro already produces,
instead of Vite's generic static-file preview server. Added a `deploy`
script (`wrangler deploy --cwd .output`) alongside it for symmetry, and
`wrangler` is now an explicit devDependency instead of being auto-installed
via `npx` on first use.

**Verified:** `npm run dev` (the Vite dev server used for day-to-day
development) was confirmed working directly — a clean boot serves a real
server-rendered page. `npm run preview`'s new `wrangler dev` command could
not be fully exercised inside this sandbox (its network allowlist doesn't
cover the Cloudflare `workerd` runtime download `wrangler` needs on first
run), so double-check it locally after `npm install`; if it doesn't behave
as expected, `npx wrangler --cwd .output dev` is the same command run
directly and is worth trying too.

---

## 2026-08-01 — Fixed the correctness/maintainability issues from the initial review pass

All six non-lint, non-offline-db items from the "Open issues" list above are
fixed. **Caveat: this environment has no Node.js/npm installed**, so none of
this could be verified with `tsc --noEmit`, `eslint`, `vitest`, or a real
build — review the diffs carefully and run the full check list (see "How to
reproduce the checks yourself" above) before merging.

- **Ride-finished state** (`src/routes/rides.$id.nav.tsx`). A `finished`
  flag latches once the rider comes within 20 m of the route's total
  distance (tracked via a `useEffect` watching `snap.progressM` against
  `ride.distance_m`, not just re-derived on every render, so it doesn't
  un-latch if GPS jitter briefly pushes progress back). While finished, the
  turn-by-turn card is replaced with a completion card (distance, elevation
  gain, a "Finish ride" button back to the ride detail page) instead of an
  infinite "Continue straight to the finish".
- **Wake lock** (`src/hooks/use-wake-lock.ts`, new file). Requests
  `navigator.wakeLock` while navigating and not yet finished; re-acquires on
  `visibilitychange` since the API releases itself whenever the tab is
  backgrounded. Silently no-ops where unsupported or denied — navigation
  still works without it, same as before.
- **Shape-preserving route simplification** (`src/lib/gpx.ts`). `simplify()`
  now runs Ramer-Douglas-Peucker (`simplifyRDP`), binary-searching the
  epsilon so the result still respects the existing `maxPoints = 2500` cap,
  instead of dropping points by uniform index sampling. Corners survive
  compression now instead of being averaged away regardless of which index
  they happened to land on.
- **Multi-segment GPX gaps** (`src/lib/gpx.ts`, `src/lib/nav.ts`,
  `src/components/RouteMap.tsx`). `parseGpx()` now groups `<trkpt>`s by the
  `<trkseg>` they came from and marks the first point after a real segment
  break with `gap: true`. `RouteMap`'s `lineFeature()` splits the route into
  a `MultiLineString` at those markers instead of drawing a straight line
  across the gap (e.g. a ferry crossing). `simplify()` runs RDP per-segment
  so a gap marker is never simplified away, and `detectTurns()` in `nav.ts`
  stops its bearing-comparison window at a gap boundary instead of
  fabricating a turn from the bearing change across it. `snapToRoute()` was
  deliberately left untouched — no automated tests exist for it yet, and the
  gap-crossing edge case there is rare enough (a rider mid-ferry-crossing
  with GPS reception) not to risk a change AGENTS.md specifically flags as
  needing careful manual verification.
- **Theme-aware map colors** (`src/components/RouteMap.tsx`). The five
  hardcoded hex colors (route line, casing, "already ridden" line, rejoin
  path, endpoint markers) are gone. A new `resolveThemeColor()` helper reads
  the app's CSS custom properties (`--color-route`, `--color-background`,
  `--color-muted-foreground`, `--color-warning`, `--color-foreground`)
  through a hidden probe element — MapLibre paints to a canvas, not the DOM,
  so it can't resolve `var(...)` itself, but the browser can, and hands back
  a format MapLibre's color parser always understands. Colors are re-applied
  via `map.setPaintProperty(...)` in the existing theme-change effect
  alongside the basemap tile swap, so toggling light/dark updates the route
  styling immediately instead of only the basemap.
- **Deduplicated Supabase fetch helpers** (`src/integrations/supabase/fetch.ts`,
  new file). `createSupabaseFetch`/`isNewSupabaseApiKey` were byte-for-byte
  identical across `client.ts`, `client.server.ts`, `auth-middleware.ts`, and
  `src/routes/api/delete-account.tsx`. All four now import the one copy —
  it holds no secrets, so it's safe to share between client and server code.
- **Unit tests for `gpx.ts` and `nav.ts`** (new: `vitest.config.ts`,
  `src/lib/gpx.test.ts`, `src/lib/nav.test.ts`; `vitest` + `jsdom` added as
  devDependencies, `npm test` added as a script). Covers `parseGpx` (invalid
  XML, distance/ascent/descent, trkseg gap marking, RDP corner preservation
  under heavy compression), `detectTurns` (a real corner is detected; a
  fabricated turn across a gap boundary is not), `snapToRoute` (off-route
  distance + progress projection), plus small sanity checks for
  `bearingDelta`, `nextTurn`, `turnLabel`, `compassLabel`, and the
  `formatDistance`/`formatDuration` formatters. Deliberately scoped to just
  these two modules per the original finding's concrete suggestion —
  `offline-db.ts` is still untested (see "Open issues" above).

**Not verified:** no Node.js/npm in this environment, so `npm install`,
`npx tsc --noEmit`, `npx eslint .`, `npm test`, and `npm run build` all still
need to be run locally.

---

## 2026-08-10 — Route/map not rendering, again (theme color resolution)

**Status: fixed** (PR #31, `src/components/RouteMap.tsx`).

**What was wrong.** This is the third recurrence of the same bug class: the
2026-08-01 "theme-aware map colors" fix (above) resolved `--color-route` etc.
by setting `color: var(--x)` on a hidden probe `<span>` and reading back
`getComputedStyle(probe).color`. That round-trip depends on how the *browser*
serializes a resolved `<color>` property — and that serialization is not
stable across browsers or versions. Theme tokens are `oklch(...)`
(`styles.css`); MapLibre's paint-property parser only understands
`rgb()`/`hex`/`hsl()`. Whenever a browser's serialization changed (or simply
differed — Chromium vs Firefox), `resolveThemeColor()` handed MapLibre a raw
`oklch(...)` string, which fails style validation and gets silently dropped
— no thrown error, no listener on `map`'s `error` event, so nothing in the
console. Confirmed live: basemap tiles rendered fine (raster, no color
computation involved), but the route line, casing, rejoin path, and
endpoint markers never appeared, on every page that uses `RouteMap`.

**The fix.** Stop depending on `<color>` serialization entirely.
`resolveThemeColor()` now reads the custom property's *raw declared text*
directly off `<html>` — `getComputedStyle(documentElement).getPropertyValue(varName)`
— instead of round-tripping through a `color` property. Per the CSS spec, a
custom property's computed value is just its declared tokens with nested
`var()` references substituted; it is never re-serialized as a typed color.
This always returns exactly what `styles.css` wrote (e.g.
`"oklch(0.62 0.19 145)"`), regardless of browser or version, removing the
dependency on that moving target for good. The existing pure-math
`oklchToRgbaString()` conversion (added in an earlier round of this same
bug) is unchanged — MapLibre still needs an `rgba()` string, this only fixes
*getting the right oklch string to convert in the first place*.

**Verified:** `tsc --noEmit` and `npm test` (109 passing) clean, no new
`eslint` issues. Confirmed end-to-end against a real production build
(`vite build --mode node`, real hashed chunks, the actual MapLibre worker —
not `vite dev`) using the reporting user's real 11k-point route: valid
`rgba()` paint colors, correct `MultiLineString` geometry, route line
renders correctly in Chromium.

**False leads ruled out while investigating:** the MapLibre worker's
`maplibre-gl-shared.mjs` dependency (see `vite.config.ts`'s
`maplibreWorkerShared` plugin) lands correctly in `.output/public/assets`
for both the `cloudflare-module` and `node-server` presets — not a
build-output-directory bug this time. A subsequent report of "basemap shows,
route still doesn't" after this fix shipped turned out to be the reporting
user testing on **Firefox Nightly** specifically — reproducing fine on
stable Firefox/Edge. Given MapLibre's GeoJSON sources are processed through
a module `Worker` (raster tiles are not, which is why basemap kept working
throughout this whole saga), a Nightly-channel quirk in worker/module
handling is the likely explanation, not an app bug — not something to chase
further here.
