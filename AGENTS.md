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
```

## Things worth knowing before touching certain areas

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
- **Keep `docs/CODE_REVIEW.md` updated.** When you fix a bug found during a
  review pass, or find a new one, add it there rather than letting findings
  live only in chat history.
