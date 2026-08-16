# Agent instructions

This file follows the [AGENTS.md](https://agents.md) convention: guidance for
any AI coding agent (Claude Code, Cursor, Copilot, etc.) working in this
repository. It isn't tied to a specific tool or vendor.

## Commands

```sh
npm install        # install dependencies
npm run dev          # start the dev server (http://localhost:8080)
npm run build         # production build (also generates the service worker
                       # — see scripts/generate-sw.mjs and docs/CODE_REVIEW.md)
npm run lint           # eslint (mostly Prettier-formatting rules)
npm run format          # prettier --write .
npx tsc --noEmit         # type check
```

Before committing or opening a PR, run `npx tsc --noEmit` and `npm run lint`
and make sure both pass.

## Project shape

```text
src/
  components/      # UI components (map, elevation chart, header, etc.)
  hooks/           # Custom React hooks
  integrations/    # Supabase client, server middleware, generated types
  lib/             # Business logic (GPX parsing, navigation math, offline
                    # storage, PWA registration, error reporting)
  routes/          # TanStack Start file-based routes
  styles.css       # Theme tokens and design system
supabase/
  migrations/      # Plain SQL — schema + RLS policies, applied in order
docs/
  CODE_REVIEW.md   # Running log of review findings and fixes
pwa-config.mjs      # Shared PWA manifest + workbox config (see below)
scripts/
  generate-sw.mjs   # Postbuild step that generates the real service worker
Dockerfile           # Self-hosted (node-server preset) build — see README.md
docker-compose.yml   # "Self-hosting with Docker" in README.md
cloudflared/
  config.yml.example # Template; real config.yml + *.json are gitignored
android/             # Capacitor native Android project — see README.md
  app/src/main/res/  # Generated icons/splash; source images are assets/*.png
capacitor.config.ts  # server.url points the Android WebView at the deployed
                      # site (see "Android app (Capacitor)" in README.md)
www/                 # Placeholder webDir Capacitor requires to exist; never
                      # actually shown since server.url is set
assets/               # Source icon/splash images for `npx @capacitor/assets generate --android`
```

## Things worth knowing before touching certain areas

- **Deployment target.** `vite.config.ts` picks the Nitro preset from the
  build mode: `npm run build` (no mode) targets Cloudflare Workers
  (`cloudflare-module`), `npm run build:node` targets a plain Node server
  (`node-server`) for the `Dockerfile`/self-hosting path. Both read the same
  source — don't hardcode Cloudflare-specific assumptions outside
  `vite.config.ts`/`wrangler`-specific scripts.
- **PWA / service worker.** `pwa-config.mjs` is the single source of truth
  for the web app manifest and workbox caching rules — both `vite.config.ts`
  (dev/manifest generation) and `scripts/generate-sw.mjs` (the real,
  production service worker) import it. Don't duplicate config between them.
  The production service worker is generated *after* `vite build` — see the
  comment in `vite.config.ts`'s `VitePWA(...)` call for why, and
  `docs/CODE_REVIEW.md` for the full story if it regresses.
- **Row Level Security.** `rides` and `profiles` are both scoped to
  `auth.uid()` in `supabase/migrations/`. Any new table needs its own RLS
  policy before shipping — don't assume the client can be trusted to filter
  by user.
- **`src/integrations/supabase/client.server.ts`** holds the service-role
  key and bypasses RLS. Only import it inside server-only code (route
  `server.handlers`, `*.server.ts` files) — never from a route component or
  anything that ships to the client bundle. `vite.config.ts`'s
  `importProtection` config will fail the build if this leaks into a client
  chunk.
- **GPX/navigation math** (`src/lib/gpx.ts`, `src/lib/nav.ts`) has no
  automated tests yet — be extra careful with manual verification (a real
  GPX file, a few lat/lon pairs by hand) when touching `parseGpx`,
  `detectTurns`, or `snapToRoute`.
- **OSM routing** (`src/lib/routing.ts`) is the shared client-side router
  behind the `/plan` route planner, `src/lib/rejoin.ts` (off-route guidance
  during navigation), and `src/lib/discover.ts` (Explore's loop generator).
  It calls the public BRouter/OSRM servers directly from the browser — no
  keys — and reads `VITE_BROUTER_URL` so self-hosters can point it at their
  own BRouter instance instead (see `.env.example`). Add new routing
  call sites on top of `fetchRoute`/`fetchOsrmRoute`/`fetchBrouterRoute`
  rather than hitting those APIs directly, so the configurable URL and
  fallback behavior stay in one place.
- **Vector map style** (`src/lib/cycling-style.ts`) is only used when
  `VITE_MAPTILER_KEY` is set (`src/components/RouteMap.tsx` falls back to
  the CARTO raster basemap otherwise). Both light and dark layer sets are
  baked into one style and toggled via layer `visibility`, not
  `map.setStyle()` — a full style swap would tear down the route/waypoint
  layers `RouteMap` adds on top and require re-adding them.
- **Keep `docs/CODE_REVIEW.md` updated.** When you fix a bug found during a
  review pass, or find a new one, add it there rather than letting findings
  live only in chat history.
- **Cloud sync (`src/lib/sync/`).** `cloud-sync-engine.server.ts` holds the
  provider-agnostic lock/mapping/classify/execute logic behind a small
  `RemoteAdapter` interface; `nextcloud-engine.server.ts`,
  `google-drive-engine.server.ts`, and `onedrive-engine.server.ts` are thin
  wrappers that build an adapter from their provider's REST client
  (`nextcloud-webdav.server.ts`, `google-drive.server.ts`,
  `onedrive.server.ts`) and call it. Nextcloud auth is a per-connection app
  password; Google Drive/OneDrive are OAuth — `oauth-state.server.ts` signs
  the `state` param carried through the authorize → provider → callback
  redirect, since the callback is a plain browser navigation with no bearer
  token, and the callback route uses `supabaseAdmin` (not
  `authenticateRequest()`) to write the connection row as a result. Add a
  new provider by writing its REST client + engine wrapper and a
  `src/routes/api/cloud/<provider>/{authorize,callback,status,disconnect,sync}.tsx`
  set mirroring the existing ones — the generic engine and `classify.ts`
  shouldn't need to change.
- **Android app.** `android/` (Capacitor) wraps the deployed site in a
  WebView rather than bundling a local static build — account deletion and
  cloud sync need `src/routes/api/`, which can't run offline in an APK. Don't
  add code that assumes the Android app has a local server; `src/lib/native.ts`
  is the one place native-vs-web branching happens (`Capacitor.isNativePlatform()`),
  guarded so it's a no-op on the web build. See "Android app (Capacitor)" in
  README.md.
- **Proximity alerts** (`findProximityAlert` in `src/lib/nav.ts`, wired into
  `src/routes/rides.$id.nav.tsx`) run on the same foreground
  `navigator.geolocation.watchPosition` stream every other location feature
  in this app already uses — a deliberate decision, not an oversight, made so
  this feature didn't have to wait on evaluating/adding a native
  background-geolocation Capacitor plugin. Alerts only need to fire while
  navigation is actively running (tab open, `useWakeLock` holding the screen
  on), so there's no case that needs location tracking to continue once the
  rider backgrounds the app or locks the screen. If a future feature actually
  needs that (e.g. alerts with the app closed), that's a much bigger addition
  — a foreground Android service, a persistent notification, battery-exemption
  UX — and deserves its own design pass rather than retrofitting this one.
