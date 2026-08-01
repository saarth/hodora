/**
 * Downloads basemap tiles covering a route into the same Cache Storage bucket
 * the service worker serves tiles from, so the map renders with no network.
 */
import type { RidePoint } from "./gpx";

export const TILE_CACHE = "map-tiles";
const ZOOMS = [11, 12, 13, 14, 15];
const MAX_TILES = 6000;

const TILE_URLS = [
  (z: number, x: number, y: number) =>
    `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}@2x.png`,
  (z: number, x: number, y: number) =>
    `https://basemaps.cartocdn.com/dark_all/${z}/${x}/${y}@2x.png`,
];

function lonToX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z,
  );
}

/** Tile URLs (both light and dark basemaps) needed for a route. */
export function tileUrlsForRoute(points: RidePoint[]): string[] {
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

  const urls: string[] = [];
  for (const key of keys) {
    const [z, x, y] = key.split("/").map(Number);
    if (x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) continue;
    for (const build of TILE_URLS) urls.push(build(z, x, y));
    if (urls.length >= MAX_TILES) break;
  }
  return urls;
}

export function estimateTileCount(points: RidePoint[]): number {
  return tileUrlsForRoute(points).length;
}

export async function isRouteMapSaved(points: RidePoint[]): Promise<boolean> {
  if (typeof caches === "undefined" || points.length === 0) return false;
  try {
    const cache = await caches.open(TILE_CACHE);
    const urls = tileUrlsForRoute(points);
    const samples = [urls[0], urls[Math.floor(urls.length / 2)], urls[urls.length - 1]].filter(
      Boolean,
    );
    const hits = await Promise.all(samples.map((url) => cache.match(url)));
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
  const urls = tileUrlsForRoute(points);
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
        if (!existing) {
          const response = await fetch(url, { mode: "cors", credentials: "omit" });
          if (response.ok) await cache.put(url, response.clone());
        }
        saved++;
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

export async function removeRouteTiles(points: RidePoint[]): Promise<void> {
  if (typeof caches === "undefined") return;
  const cache = await caches.open(TILE_CACHE);
  const urls = tileUrlsForRoute(points);
  await Promise.all(urls.map((url) => cache.delete(url)));
}
