# Hodora

[<img src="https://raw.githubusercontent.com/ImranR98/Obtainium/main/assets/graphics/badge_obtainium.png" alt="Get it on Obtainium" height="60">](https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https://github.com/saarth/hodora)

> **Note:** I've never written code before this project — Hodora is a personal, learn-by-doing effort. It's not professionally reviewed, so please don't assume production-grade quality. I'd genuinely welcome feedback, corrections, and suggestions from anyone more experienced — issues and PRs pointing out mistakes or better approaches are very much appreciated.

Hodora is a modern, open-source GPX bike navigation app. Import your GPX routes, view them on an interactive map with elevation profiles, and ride them with live turn-by-turn navigation — even offline.

- **Import GPX routes** from your favorite route planners (Komoot, Strava, Ride with GPS, etc.)
- **Plan a route** by tapping the map — routed over real roads and paths with OpenStreetMap data (BRouter/OSRM)
- **Turn-by-turn navigation** with distance, grade, and turn prompts
- **Live weather and wind** during navigation — temperature, conditions, and a headwind/tailwind call-out relative to your direction of travel
- **Offline maps and routes** — save map tiles and GPX data to your device
- **Light and dark themes** inspired by Sleep for Android
- **Cross-platform** — web app and installable PWA on any modern device

## Tech stack

- [TanStack Start](https://tanstack.com/start) — full-stack React framework
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) — styling
- [MapLibre GL](https://maplibre.org/) — maps, with a CARTO raster basemap by
  default or an optional custom cycling-focused vector style (see
  "Route planning & map style" below)
- [BRouter](https://brouter.de/) / [OSRM](https://routing.openstreetmap.de/) — OSM-based bike routing for route planning and on-route rejoin guidance
- [Open-Meteo](https://open-meteo.com/) — free, no-key weather API for live conditions during navigation
- [Supabase](https://supabase.com/) — auth, database, and storage
- [Vite PWA](https://vite-pwa-org.netlify.app/) — offline service worker

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (20 or newer recommended)
- [Bun](https://bun.sh/) or npm
- A free Supabase project for auth and data storage

> **Windows users:** Bun is not installed by default on Windows. The project also works with npm. If you want to use Bun, install it first:
>
> ```powershell
> powershell -c "irm bun.sh/install.ps1 | iex"
> ```
> Then close and reopen PowerShell. If you prefer npm, use the `npm` commands shown below instead of `bun`.

### 1. Clone the repo

```sh
git clone https://github.com/<your-username>/hodora.git
cd hodora
```

### 2. Install dependencies

```sh
bun install
# or npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in your Supabase values:

```sh
cp .env.example .env
```

Then edit `.env` with your Supabase project URL, project ID, and publishable (anon) key.
Email/password sign-in works out of the box with no extra setup.

### 4. Start the dev server

```sh
bun run dev
# or npm run dev
```

Open the URL shown in the terminal, typically `http://localhost:8080`.

## PWA / offline use

The web app is already configured as a Progressive Web App. On Android, open it in Chrome and tap **Add to Home Screen**. On iOS, use Safari → **Share → Add to Home Screen**. For full offline navigation, open a route detail page and tap **Download offline data**.

## Android app (Capacitor)

`android/` is a [Capacitor](https://capacitorjs.com/) native shell around the
deployed web app — same UI, same account, same offline route/map caching
(nothing is duplicated locally), plus a real launcher icon, splash screen,
themed status bar, and hardware back button support. It's a thin WebView
wrapper, not a separate build: account deletion and the Google
Drive/OneDrive/Nextcloud cloud sync features need Hodora's server routes
(`src/routes/api/`), which can't run bundled offline in an APK, so the app
always loads a live deployment over HTTPS rather than shipping a local copy
of the site.

`capacitor.config.ts` points `server.url` at `https://hodora.app` by default.
Override it for local development against the Vite dev server instead:

```sh
npm run dev                                            # start the dev server
CAPACITOR_SERVER_URL=http://10.0.2.2:8080 npx cap sync android   # Android emulator
# or, for a physical device on the same network:
CAPACITOR_SERVER_URL=http://<your-lan-ip>:8080 npx cap sync android
```

### Building the APK

You'll need [Android Studio](https://developer.android.com/studio) (which
bundles the Android SDK) — this repo doesn't vendor one. First time setup:

```sh
npm install
npx cap sync android
npx cap open android      # opens android/ in Android Studio
```

From Android Studio, **Run** installs a debug build on a connected
device/emulator; **Build → Generate Signed App Bundle / APK** produces a
release build (you'll need to create/select a signing keystore — Android
Studio walks you through this).

Prefer the command line? `cd android && ./gradlew assembleDebug` builds
`android/app/build/outputs/apk/debug/app-debug.apk` (needs `ANDROID_HOME` set
and SDK platform/build-tools installed — Android Studio's SDK Manager handles
that).

**"Invalid Gradle JDK configuration" on first open:** the Android Gradle
Plugin here (8.13.0) needs JDK 17+, and a fresh checkout has no Project JDK
set. In the dialog, click **Use Embedded JDK** (or set it manually under
**Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle
JDK**) to point at Android Studio's bundled JBR. This is a local IDE setting,
not something tracked in the repo.

### Regenerating icons/splash screen

`assets/icon.png` and `assets/splash.png` are the source images (derived from
`public/icon-512.png`); the actual per-density Android resources under
`android/app/src/main/res/` are generated from them, not hand-edited. After
changing either source image:

```sh
npx @capacitor/assets generate --android
```

### Native plugins

`@capacitor/app` (hardware back button → router history, or exits the app at
the root), `@capacitor/status-bar` (status bar color follows the app's
light/dark theme), and `@capacitor/splash-screen` are wired up in
`src/lib/native.ts`, called from `src/routes/__root.tsx`. All three are
no-ops on the web build (`Capacitor.isNativePlatform()` guards them), so
there's nothing to conditionally import elsewhere. Geolocation (route
planning, turn-by-turn nav) uses the browser's `navigator.geolocation` as-is
— Capacitor's Android WebView bridges that to the native runtime permission
prompt automatically as long as `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`
are declared in `android/app/src/main/AndroidManifest.xml` (they already
are), so no plugin or code change was needed for that.

## Project structure

```text
src/
  components/      # UI components (map, elevation chart, header, etc.)
  hooks/           # Custom React hooks
  integrations/    # Supabase client and auth middleware
  lib/             # Business logic (GPX parsing, navigation, offline DB, rides)
  routes/          # TanStack Start routes
  styles.css       # Theme tokens and design system
  ...
vite.config.ts    # Vite + PWA configuration
```

## Deploying

Hodora builds to Cloudflare Workers via [Nitro](https://nitro.build/)'s
`cloudflare-module` preset (set in `vite.config.ts`):

```sh
npm run build
npm run preview   # runs the build locally with wrangler dev — the real
                    # Workers runtime, not just static file serving. Note:
                    # `npm run dev` (the Vite dev server) is what you want
                    # for day-to-day development; use `preview` to sanity
                    # check an actual production build before deploying.
npm run deploy    # wrangler deploy
```

`npm run build` produces everything Wrangler needs under `.output/` —
including a fresh `.output/server/wrangler.json`, regenerated on every build,
so there's no `wrangler.toml` to hand-maintain. The first `npm run deploy`
will prompt you to log in to a Cloudflare account. Remember to set
`SUPABASE_SERVICE_ROLE_KEY` (used by `src/routes/api/delete-account.tsx` and
`src/integrations/supabase/client.server.ts`) in your Cloudflare Worker's
environment variables — never in a client-visible `.env` or `VITE_`-prefixed
variable. If you want the "Connections" cloud-sync feature, also set
`TOKEN_ENCRYPTION_KEY` the same way — see `.env.example` for how to generate
one. Both are optional in the sense that the app runs without them; only the
account-deletion and cloud-sync features need them. Google Drive and
OneDrive connections need their own OAuth credentials on top of that — see
"Cloud sync connections" below.

### Cloud sync connections

Settings → Connections lets a rider sync their routes to a cloud storage
account as GPX files. Nextcloud works out of the box (it just needs a
server URL, username, and app password from the rider). Google Drive and
OneDrive are OAuth-based, so *you* (the person running this Hodora
instance) need to register an app with each provider once and put its
credentials in your environment — riders never see or provide these, they
just click "Connect".

**Google Drive:**

1. [Google Cloud Console](https://console.cloud.google.com/) → create or
   pick a project → **APIs & Services → Library** → enable the **Google
   Drive API**.
2. **APIs & Services → OAuth consent screen** → configure it (External is
   fine for personal use; add your own account as a test user if the app
   stays in "Testing" mode).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type **Web application** → under **Authorized redirect
   URIs** add `https://your-domain/api/cloud/google-drive/callback`
   (use your actual deployed origin — `http://localhost:8080/...` for local
   dev).
4. Copy the **Client ID** and **Client secret** into `GOOGLE_DRIVE_CLIENT_ID`
   / `GOOGLE_DRIVE_CLIENT_SECRET`.

Hodora only ever requests the `drive.file` scope — it can see and manage
only the files/folders it creates itself, never the rest of a rider's
Drive.

**OneDrive:**

1. [Azure Portal](https://portal.azure.com/) → **Microsoft Entra ID → App
   registrations → New registration**. Supported account types: "Accounts
   in any organizational directory and personal Microsoft accounts" if you
   want both personal and work/school OneDrive accounts to be able to
   connect.
2. Under **Authentication → Add a platform → Web**, add
   `https://your-domain/api/cloud/onedrive/callback` as a redirect URI.
3. Under **Certificates & secrets → New client secret**, create one and
   copy its **value** immediately (it's only shown once).
4. Copy the **Application (client) ID** and the client secret value into
   `ONEDRIVE_CLIENT_ID` / `ONEDRIVE_CLIENT_SECRET`.

Hodora only ever requests the `Files.ReadWrite.AppFolder` scope — it's
confined to its own special app folder, invisible to the rest of a rider's
OneDrive.

Both are entirely optional: leave their env vars unset and Settings →
Connections simply won't be able to complete that provider's OAuth flow
(the button will fail with an error) while Nextcloud keeps working
normally.

If you'd rather deploy somewhere other than Cloudflare Workers, `npm run
build:node` builds Nitro's `node-server` preset instead (see "Self-hosting
with Docker" below) — see the [Nitro deployment docs](https://nitro.build/deploy)
for the full list of other presets if you want something else entirely.

### Route planning & map style

**Route planning** (tap the map to build a route on the new **Plan** page,
plus the "rejoin the route" guide shown when you go off-track during
navigation) works out of the box against the free public
[BRouter](https://brouter.de/) server — no signup, no key. If you're
self-hosting your own BRouter instance (or a BRouter-compatible server), set
`VITE_BROUTER_URL` to its base URL instead. It's a client-visible `VITE_`
variable since routing requests are made straight from the rider's browser.

**Map style** defaults to a raster basemap from CARTO (also free, no key).
Set `VITE_MAPTILER_KEY` to switch to a custom, cycling-focused **vector**
style instead (`src/lib/cycling-style.ts`) — dedicated cycleways get their
own color, unpaved tracks/paths are dashed, inspired by
[CyclOSM](https://www.cyclosm.org/)'s visual language. (CyclOSM itself is a
Mapnik/CartoCSS raster style with no vector equivalent, so this is a custom
style built for MapLibre against [MapTiler](https://www.maptiler.com/)'s
vector tiles, not a port.) Get a free API key at
[cloud.maptiler.com](https://cloud.maptiler.com/account/keys/) — the free
tier is generous enough for personal/small-group self-hosting. Leave it
unset to keep the raster basemap.

### Self-hosting with Docker (e.g. Unraid)

The included `Dockerfile` builds a plain Node server image (Nitro's
`node-server` preset) instead of a Cloudflare Worker bundle — useful for
running Hodora on your own hardware (Unraid, a home server, any Docker host)
that isn't always on the public internet the way Cloudflare's edge is.

```sh
docker compose up -d --build
```

`docker compose` reads a `.env` file from the repo root the same way the dev
server does (see `.env.example`) — it already has everything `docker-compose.yml`
needs except `SUPABASE_SERVICE_ROLE_KEY`, which you'll need to add there too.
Without Compose, the equivalent is:

```sh
docker build \
  --build-arg VITE_SUPABASE_URL=https://your-project-id.supabase.co \
  --build-arg VITE_SUPABASE_PROJECT_ID=your-project-id \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key \
  -t hodora .

docker run -d -p 3000:3000 \
  -e SUPABASE_URL=https://your-project-id.supabase.co \
  -e SUPABASE_PROJECT_ID=your-project-id \
  -e SUPABASE_PUBLISHABLE_KEY=your-anon-key \
  -e SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  hodora
```

Note the split: the three `VITE_`-prefixed values are **build args** (Vite
inlines them into the client bundle at build time, so they have to be known
before the image is built), while everything passed with `docker run -e` is a
**runtime** environment variable read by the server. Never pass
`SUPABASE_SERVICE_ROLE_KEY` as a build arg — build args can end up visible in
the image's layer history, and this key bypasses Row Level Security.

Route planning and the vector map style (see "Route planning & map style"
above) are also `VITE_`-prefixed, so they're build args too if you want them
— add `--build-arg VITE_BROUTER_URL=...` and/or
`--build-arg VITE_MAPTILER_KEY=...` to the `docker build` command above.
Both are optional; omit them for the zero-config defaults.

**On Unraid specifically:** see **[docs/UNRAID.md](./docs/UNRAID.md)** for a
full copy-paste walkthrough — installing the Community Applications
"Docker Compose Manager" plugin, filling in `.env`, and putting a reverse
proxy (Nginx Proxy Manager, SWAG, or Cloudflare Tunnel) in front for HTTPS.
HTTPS matters here: a plain `http://<unraid-ip>:3000` URL won't register the
service worker (offline maps/routes, "Add to Home Screen") since browsers
only allow that over HTTPS or true `localhost`.

#### Cloudflare Tunnel (no open ports)

`docker-compose.yml` already includes a commented-in `cloudflared` service
so the tunnel runs alongside Hodora instead of as a separate process. Needs
a domain on Cloudflare DNS:

1. [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) →
   **Networks → Tunnels → Create a tunnel** → choose **Cloudflared** → name
   it (e.g. `hodora`) → **Save tunnel**.
2. The setup page shows install commands for several platforms — copy the
   token from any of them (the long string after `--token`) into
   `CLOUDFLARE_TUNNEL_TOKEN` in `.env`.
3. Still on the tunnel's page → **Public Hostname** tab → **Add a public
   hostname** → subdomain/domain of your choice, type `HTTP`, URL
   `hodora:3000` (the compose service name, not `localhost` — the two
   containers talk to each other over the compose network). Save.
4. `docker compose up -d --build`.

Cloudflare creates the DNS record and terminates HTTPS for you — no
certificate to manage, and no config file to write. Once it's running,
`https://hodora.yourdomain.com` is what to open on your phone, and what to
add to Supabase's Auth URL Configuration.

## Contributing

Contributions are welcome! Please open an issue or pull request. If you find a bug or want a new feature, let us know in the issue tracker.

When contributing, keep the existing code style and make sure the type checker passes:

```sh
bun run lint
```

## License

Hodora is open-source software released under the [MIT License](./LICENSE).
