/**
 * Downloads basemap tiles covering a route into the same Cache Storage bucket
 * the service worker serves tiles from, so the map renders with no network.
 *
 * These are vector tiles, which changes the arithmetic from the raster
 * basemap this replaced: one tile serves *both* the light and dark themes
 * (the cycling style bakes both layer sets into one style), and the top
 * zoom the providers publish is 14 — MapLibre overzooms from there, so
 * there is nothing above z14 to fetch. That halves the URL count against
 * the old two-raster-set approach even after dropping z15. Individual
 * tiles are much larger though (~100KB against ~50KB for a raster PNG),
 * hence the lower `MAX_TILES` cap.
 */
import {
  OPENFREEMAP_TILEJSON,
  glyphUrlsForOffline,
  staticTileTemplate,
  tileUrlFrom,
} from "./basemap";
import type { RidePoint } from "./gpx";

export const TILE_CACHE = "map-tiles";
const ZOOMS = [11, 12, 13, 14];
const MAX_TILES = 1500;

/** Rough average bytes per vector tile, for the size estimate the save UI shows. */
export const APPROX_TILE_BYTES = 100 * 1024;

function lonToX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

/**
 * Every `z/x/y` a route would need, uncapped. Shared by `tileKeysForRoute`
 * (which applies the `MAX_TILES` cap) and `isRouteTileSetTruncated` (which
 * needs to know whether that cap actually cut anything) so both agree on
 * exactly the same set instead of two independently-drifting computations.
 *
 * Deliberately returns keys rather than URLs: the count and the truncation
 * check don't depend on which provider is serving tiles, which keeps them
 * synchronous for render-time callers even though resolving a URL can
 * require a network round trip (see `resolveTileTemplate`).
 */
function allTileKeysForRoute(points: RidePoint[]): string[] {
  const keys = new Set<string>();

  for (const zoom of ZOOMS) {
    const seen = new Set<string>();
    for (const point of points) {
      const x = lonToX(point.lon, zoom);
      const y = latToY(point.lat, zoom);
      // A one-tile margin keeps the surroundings visible while panning.
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          seen.add(`${zoom}/${x + dx}/${y + dy}`);
        }
      }
    }
    for (const key of seen) keys.add(key);
  }

  return [...keys].filter((key) => {
    const [z, x, y] = key.split("/").map(Number);
    return x >= 0 && y >= 0 && x < 2 ** z && y < 2 ** z;
  });
}

/** Tile keys needed for a route, capped at `MAX_TILES`. */
export function tileKeysForRoute(points: RidePoint[]): string[] {
  return allTileKeysForRoute(points).slice(0, MAX_TILES);
}

export function estimateTileCount(points: RidePoint[]): number {
  return tileKeysForRoute(points).length;
}

/** True once a route needs more tiles than the `MAX_TILES` cap — the offline map will have gaps outside whatever got queued. */
export function isRouteTileSetTruncated(points: RidePoint[]): boolean {
  return allTileKeysForRoute(points).length > MAX_TILES;
}

/**
 * The `{z}/{x}/{y}` template to fetch tiles from.
 *
 * MapTiler's is static. OpenFreeMap versions each planet build behind a
 * dated path and only advertises the current one via its TileJSON, so that
 * has to be fetched — and it has to be fetched *the same way* the live map
 * gets it, or the URLs downloaded here would never match the ones MapLibre
 * later asks for. The cached copy is consulted first so this still resolves
 * with no network, which is exactly the situation `isRouteMapSaved` runs in
 * when a rider opens a saved route offline.
 *
 * When OpenFreeMap publishes a new planet the template changes, previously
 * downloaded tiles stop matching, and `isRouteMapSaved` correctly reports
 * the route as no longer saved so the UI can offer a re-download.
 */
async function resolveTileTemplate(cache: Cache): Promise<string | null> {
  if (staticTileTemplate) return staticTileTemplate;

  const cached = await cache.match(OPENFREEMAP_TILEJSON);
  if (cached) {
    try {
      const tiles = (await cached.clone().json())?.tiles;
      if (Array.isArray(tiles) && tiles[0]) return tiles[0] as string;
    } catch {
      /* fall through to the network */
    }
  }

  try {
    const response = await fetch(OPENFREEMAP_TILEJSON, { mode: "cors", credentials: "omit" });
    if (!response.ok) return null;
    await cache.put(OPENFREEMAP_TILEJSON, response.clone());
    const tiles = (await response.json())?.tiles;
    return Array.isArray(tiles) && tiles[0] ? (tiles[0] as string) : null;
  } catch {
    return null;
  }
}

/** Every URL a route needs offline: its vector tiles plus the glyphs labels are drawn from. */
async function routeUrls(cache: Cache, points: RidePoint[]): Promise<string[]> {
  const template = await resolveTileTemplate(cache);
  if (!template) return [];
  const tiles = tileKeysForRoute(points).map((key) => {
    const [z, x, y] = key.split("/").map(Number);
    return tileUrlFrom(template, z, x, y);
  });
  return [...tiles, ...glyphUrlsForOffline()];
}

/**
 * Every URL a route needs offline. Async because resolving OpenFreeMap's
 * versioned tile template can require fetching its TileJSON; use
 * `estimateTileCount` / `isRouteTileSetTruncated` for the synchronous
 * count and truncation checks that render-time callers need.
 */
export async function tileUrlsForRoute(points: RidePoint[]): Promise<string[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(TILE_CACHE);
  return routeUrls(cache, points);
}

/**
 * Checks every tile the route needs, not a sample — a route with even a
 * few missing tiles isn't safely "saved for offline use," and sampling
 * (the previous approach checked only 3 tiles) can miss large gaps
 * elsewhere in the route. `cache.match` is a local, synchronous-ish
 * lookup, so checking the full set (capped at `MAX_TILES` already) is
 * cheap enough to do on every page load.
 */
export async function isRouteMapSaved(points: RidePoint[]): Promise<boolean> {
  if (typeof caches === "undefined" || points.length === 0) return false;
  try {
    const cache = await caches.open(TILE_CACHE);
    const urls = await routeUrls(cache, points);
    if (urls.length === 0) return false;
    const hits = await Promise.all(urls.map((url) => cache.match(url)));
    return hits.every(Boolean);
  } catch {
    return false;
  }
}

/**
 * Fetch and store every tile for the route. Reports 0..1 progress.
 */
export async function downloadRouteTiles(
  points: RidePoint[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ saved: number; total: number }> {
  if (typeof caches === "undefined") throw new Error("Offline maps aren't supported here");

  const cache = await caches.open(TILE_CACHE);
  const urls = await routeUrls(cache, points);
  // No template means the tile provider couldn't be reached at all, so
  // there is nothing to download — report it as a total failure rather
  // than a vacuous success over an empty URL list.
  if (urls.length === 0) return { saved: 0, total: 0 };

  let done = 0;
  let saved = 0;
  const concurrency = 8;
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      if (signal?.aborted) return;
      const url = urls[cursor++];
      try {
        const existing = await cache.match(url);
        if (existing) {
          saved++;
        } else {
          const response = await fetch(url, { mode: "cors", credentials: "omit" });
          // Only count it once it's actually in the cache — a failed
          // fetch (404/429/network error) must not be reported as saved,
          // or `isRouteMapSaved`'s later full-coverage check and this
          // count silently disagree about what's really offline-ready.
          if (response.ok) {
            await cache.put(url, response.clone());
            saved++;
          }
        }
      } catch {
        /* skip individual tile failures */
      }
      done++;
      if (done % 10 === 0 || done === urls.length) onProgress?.(done, urls.length);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  onProgress?.(urls.length, urls.length);
  return { saved, total: urls.length };
}

/**
 * Turns a `downloadRouteTiles` result into the outcome the UI should report.
 * `downloadRouteTiles` never throws on individual tile failures (a flaky
 * connection just means fewer tiles get cached), so callers must check the
 * counts themselves instead of assuming success just because nothing threw.
 */
export function describeTileSaveResult(
  saved: number,
  total: number,
): { ok: true; message: string } | { ok: false; message: string } {
  if (total > 0 && saved >= total) {
    return { ok: true, message: "Route and maps saved for offline use" };
  }
  if (saved > 0) {
    return {
      ok: false,
      message: `Only ${saved} of ${total} map tiles downloaded — some areas may be missing offline. Try again with a better connection.`,
    };
  }
  return {
    ok: false,
    message: "Couldn't download map tiles — check your connection and try again.",
  };
}

export async function removeRouteTiles(points: RidePoint[]): Promise<void> {
  if (typeof caches === "undefined") return;
  const cache = await caches.open(TILE_CACHE);
  const urls = await routeUrls(cache, points);
  // The glyphs and the TileJSON are shared by every saved route, so only
  // this route's own tiles come out.
  const shared = new Set(glyphUrlsForOffline());
  await Promise.all(urls.filter((url) => !shared.has(url)).map((url) => cache.delete(url)));
}
