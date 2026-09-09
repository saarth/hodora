# Listing screenshots

Generates the screenshots used for Product Hunt, AlternativeTo, the README
and the PWA manifest, by driving the real app in a headless browser.

```sh
npm run screenshots                 # everything, into ./screenshots
npm run screenshots -- --only=03-navigation
npm run screenshots -- --out=/tmp/shots --stub-tiles
```

## What is real and what is not

The UI is the app: it runs from source on the dev server, the map is
MapLibre drawing `src/lib/cycling-style.ts`, the elevation and speed charts
are the app's own charts, and the navigation screen is following a GPS feed
through the same code a rider's phone runs.

Four things are supplied by the harness, because a screenshot run can't get
them for free:

| Faked                                                         | Where                         | Why                                                                                                  |
| ------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| The account and its rides                                     | `stubs.mjs`, `rides.mjs`      | Screenshots shouldn't need someone's real Supabase account or real GPX files.                        |
| The rider's GPS                                               | `capture.mjs` (`riderScript`) | Playwright's geolocation has no speed or heading, which is most of what the navigation screen shows. |
| Weather, POIs, place search, routing                          | `stubs.mjs`                   | Deterministic shots, and no hammering free public APIs on every run.                                 |
| The basemap — **only when the real tile host is unreachable** | `world.mjs`, `tiles.mjs`      | So the run works offline or in a sandbox.                                                            |

## Basemap

By default the run uses the real tile provider and the screenshots show real
geography. If `tiles.openfreemap.org` can't be reached, it falls back to a
generated stand-in: a procedural corner of countryside — roads, terrain,
rivers, woods and invented village names — served as OpenMapTiles-schema
vector tiles so the app's own map style draws it unchanged. The demo routes
are planned over that same road network, so the line on the map follows the
lanes beneath it.

Force either mode with `--real-tiles` or `--stub-tiles`. The run prints
which one it used. **Screenshots published as marketing material should be
captured with real tiles** — a stand-in basemap is for development and for
checking framing.

Labels on the stand-in basemap need SDF glyphs, which `fontnik` builds from
Noto Sans. It's not a dependency of the project (it's a native module, and
it's only needed for the fallback path):

```sh
npm i --no-save fontnik    # optional — without it the stand-in map has no labels
```

## Files

| File          | Purpose                                                        |
| ------------- | -------------------------------------------------------------- |
| `capture.mjs` | Entry point: shot list, viewports, browser driving             |
| `stubs.mjs`   | Supabase, Open-Meteo, Overpass, Nominatim and router stand-ins |
| `world.mjs`   | Procedural countryside — road graph, terrain, water, villages  |
| `rides.mjs`   | Demo rides planned over that road graph, with cue sheets       |
| `tiles.mjs`   | Vector tiles and glyphs for the stand-in basemap               |
| `gallery.mjs` | Composes the captured shots into Product Hunt gallery images   |

## Options

| Flag                            | Default                 | Meaning                                             |
| ------------------------------- | ----------------------- | --------------------------------------------------- |
| `--out=DIR`                     | `screenshots`           | Where the PNGs go                                   |
| `--only=a,b`                    | all                     | Capture just these shots                            |
| `--base-url=URL`                | `http://127.0.0.1:8080` | Dev server; one is started if nothing answers       |
| `--real-tiles` / `--stub-tiles` | auto                    | Force the basemap source                            |
| `--full`                        | off                     | Full-page screenshots — useful for choosing framing |

`CHROMIUM_PATH` points the run at an already-installed Chromium instead of
`npx playwright install`. `HTTPS_PROXY`, when set, is passed through to the
browser so it goes out the same way the rest of the environment does.

## Debugging a shot

| Variable        | Effect                                                                          |
| --------------- | ------------------------------------------------------------------------------- |
| `DEBUG_STUBS=1` | Logs every request that leaves the page, and any failure inside the router stub |
| `DEBUG_TILES=1` | Logs each tile, glyph and TileJSON request the map makes                        |

`--full` plus `--only=<shot>` captures the whole page, which is the quickest
way to choose a `scrollTo` for a new shot.

## Adding a shot

Add an entry to `buildShots()` in `capture.mjs`:

```js
{
  name: "15-something",       // becomes <name>.png
  device: "phone",            // or "desktop"
  path: "/some/route",
  theme: "dark",              // optional, defaults to light
  map: false,                 // skip the wait for MapLibre to settle
  offlineRides: [ride],       // seed the app's IndexedDB offline store
  rider: { track, startIndex },// simulate a moving GPS
  dwellSeconds: 60,           // let the ride run before shooting
  prepare: async (page) => {},// clicks, waits — before the map settles
  scrollTo: 430,              // px, a selector, or a (page) => Promise
}
```
