# Hodora

> **Note:** I've never written code before this project — Hodora is a personal, learn-by-doing effort. It's not professionally reviewed, so please don't assume production-grade quality. I'd genuinely welcome feedback, corrections, and suggestions from anyone more experienced — issues and PRs pointing out mistakes or better approaches are very much appreciated.

Hodora is a modern, open-source GPX bike navigation app. Import your GPX routes, view them on an interactive map with elevation profiles, and ride them with live turn-by-turn navigation — even offline.

- **Import GPX routes** from your favorite route planners (Komoot, Strava, Ride with GPS, etc.)
- **Turn-by-turn navigation** with distance, grade, and turn prompts
- **Offline maps and routes** — save map tiles and GPX data to your device
- **Light and dark themes** inspired by Sleep for Android
- **Cross-platform** — web app and installable PWA on any modern device

## Tech stack

- [TanStack Start](https://tanstack.com/start) — full-stack React framework
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) — styling
- [MapLibre GL](https://maplibre.org/) — maps with CARTO raster tiles
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

**Google sign-in:** Hodora uses Supabase's built-in Google OAuth
(`supabase.auth.signInWithOAuth({ provider: "google" })`), which needs a
Google OAuth client of your own. In the Supabase dashboard: **Authentication
→ Providers → Google**, enable it, and fill in a Client ID/Secret from a
[Google Cloud OAuth client](https://console.cloud.google.com/apis/credentials)
(type "Web application"). Add your Supabase project's callback URL
(`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized
redirect URI on the Google side, and add your app's own origin(s)
(e.g. `http://localhost:8080`, your production domain) as authorized
JavaScript origins. Email/password sign-in works out of the box with no
extra setup.

### 4. Start the dev server

```sh
bun run dev
# or npm run dev
```

Open the URL shown in the terminal, typically `http://localhost:8080`.

## PWA / offline use

The web app is already configured as a Progressive Web App. On Android, open it in Chrome and tap **Add to Home Screen**. On iOS, use Safari → **Share → Add to Home Screen**. For full offline navigation, open a route detail page and tap **Download offline data**.

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
variable.

If you'd rather deploy somewhere other than Cloudflare Workers, `npm run
build:node` builds Nitro's `node-server` preset instead (see "Self-hosting
with Docker" below) — see the [Nitro deployment docs](https://nitro.build/deploy)
for the full list of other presets if you want something else entirely.

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

**On Unraid specifically:** the Community Applications plugin "Docker Compose
Manager" can run `docker-compose.yml` directly, or you can build the image
elsewhere and add it as a custom container from Unraid's Docker tab pointing
at port 3000. Either way, put a reverse proxy in front for HTTPS — a plain
`http://<unraid-ip>:3000` URL won't register the service worker (offline
maps/routes, "Add to Home Screen") since browsers only allow that over HTTPS
or true `localhost`. [Nginx Proxy Manager](https://nginxproxymanager.com/),
[SWAG](https://docs.linuxserver.io/general/swag/), and Cloudflare Tunnel are
all common Unraid-friendly options for that.

#### Cloudflare Tunnel (no open ports)

`docker-compose.yml` already includes a commented-in `cloudflared` service
so the tunnel runs alongside Hodora instead of as a separate process. Needs
a domain on Cloudflare DNS:

```sh
cloudflared tunnel login
cloudflared tunnel create hodora
cloudflared tunnel route dns hodora hodora.yourdomain.com
```

That prints a tunnel ID and writes a `<tunnel-id>.json` credentials file to
`~/.cloudflared/`. Then, in the repo:

```sh
mkdir -p cloudflared
cp cloudflared/config.yml.example cloudflared/config.yml
# edit cloudflared/config.yml: set <tunnel-id> and your real hostname
cp ~/.cloudflared/<tunnel-id>.json cloudflared/
docker compose up -d --build
```

`config.yml.example` already points at `http://hodora:3000` — the
docker-compose service name, not `localhost`, since the two containers talk
to each other over the compose network. Both `cloudflared/config.yml` and
the `*.json` credentials file are gitignored; don't commit them. Once it's
running, `https://hodora.yourdomain.com` is what to open on your phone, and
what to add to Supabase's Auth URL Configuration (and the Google OAuth
client's authorized origins, if you use Google sign-in).

## Contributing

Contributions are welcome! Please open an issue or pull request. If you find a bug or want a new feature, let us know in the issue tracker.

When contributing, keep the existing code style and make sure the type checker passes:

```sh
bun run lint
```

## License

Hodora is open-source software released under the [MIT License](./LICENSE).
