import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeTileSaveResult,
  downloadRouteTiles,
  estimateTileCount,
  isRouteMapSaved,
  isRouteTileSetTruncated,
  tileUrlsForRoute,
} from "./offline-tiles";
import type { RidePoint } from "./gpx";

const point = (lat: number, lon: number, d = 0): RidePoint => ({ lat, lon, ele: 0, d });
const shortRoute: RidePoint[] = [point(51.5, -0.1), point(51.51, -0.11), point(51.52, -0.12)];

const TILEJSON_URL = "https://tiles.openfreemap.org/planet";
const TILE_TEMPLATE = "https://tiles.openfreemap.org/planet/20260823_080002_pt/{z}/{x}/{y}.pbf";

/**
 * Stubs fetch so the TileJSON resolves to a fixed planet build; `onTile`
 * decides what each actual tile/glyph request returns.
 */
function stubFetch(onTile: (url: string) => Response) {
  const mock = vi.fn().mockImplementation((url: string) => {
    if (url === TILEJSON_URL) {
      return Promise.resolve(new Response(JSON.stringify({ tiles: [TILE_TEMPLATE] })));
    }
    return Promise.resolve(onTile(url));
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** In-memory stand-in for the Cache Storage API — jsdom doesn't implement it. */
function makeFakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        match: async (url: string) => store.get(url),
        put: async (url: string, response: Response) => {
          store.set(url, response);
        },
        delete: async (url: string) => store.delete(url),
      };
    },
    delete: async (name: string) => stores.delete(name),
  };
  return caches;
}

describe("offline tiles", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("isRouteMapSaved", () => {
    it("returns false when nothing is cached", async () => {
      vi.stubGlobal("caches", makeFakeCaches());
      stubFetch(() => new Response("tile"));
      expect(await isRouteMapSaved(shortRoute)).toBe(false);
    });

    it("returns false when the tile provider can't be reached at all, rather than vacuously true over an empty URL list", async () => {
      vi.stubGlobal("caches", makeFakeCaches());
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
      expect(await isRouteMapSaved(shortRoute)).toBe(false);
    });

    it("returns true only once every single tile the route needs is cached, not just a sample", async () => {
      const fakeCaches = makeFakeCaches();
      vi.stubGlobal("caches", fakeCaches);
      stubFetch(() => new Response("tile"));
      const cache = await fakeCaches.open("map-tiles");
      const urls = await tileUrlsForRoute(shortRoute);

      // Cache every tile except one in the middle — the old 3-sample check
      // (first/middle-ish/last) could easily miss a gap like this.
      const missingIndex = Math.floor(urls.length / 3);
      for (const [index, url] of urls.entries()) {
        if (index === missingIndex) continue;
        await cache.put(url, new Response("tile"));
      }
      expect(await isRouteMapSaved(shortRoute)).toBe(false);

      await cache.put(urls[missingIndex], new Response("tile"));
      expect(await isRouteMapSaved(shortRoute)).toBe(true);
    });
  });

  describe("downloadRouteTiles", () => {
    it("only counts a tile as saved when the fetch actually succeeded and was cached", async () => {
      vi.stubGlobal("caches", makeFakeCaches());
      let call = 0;
      stubFetch(() => {
        call++;
        // Every third tile fails (simulating flaky/rate-limited tile CDN responses).
        const ok = call % 3 !== 0;
        return new Response("tile", { status: ok ? 200 : 429 });
      });

      const expected = (await tileUrlsForRoute(shortRoute)).length;
      const { saved, total } = await downloadRouteTiles(shortRoute);
      expect(total).toBe(expected);
      expect(saved).toBeLessThan(total);
      expect(saved).toBe(total - Math.floor(total / 3));
    });

    it("counts an already-cached tile as saved without re-fetching it", async () => {
      const fakeCaches = makeFakeCaches();
      vi.stubGlobal("caches", fakeCaches);
      stubFetch(() => new Response("tile"));
      const cache = await fakeCaches.open("map-tiles");
      const urls = await tileUrlsForRoute(shortRoute);
      for (const url of urls) await cache.put(url, new Response("tile"));

      // The TileJSON is already cached by the resolution above, so a fully
      // cached route must not hit the network at all from here on.
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const { saved, total } = await downloadRouteTiles(shortRoute);
      expect(saved).toBe(total);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reports a total failure instead of a vacuous success when the tile template can't be resolved", async () => {
      vi.stubGlobal("caches", makeFakeCaches());
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

      const { saved, total } = await downloadRouteTiles(shortRoute);
      expect({ saved, total }).toEqual({ saved: 0, total: 0 });
      expect(describeTileSaveResult(saved, total).ok).toBe(false);
    });
  });

  describe("describeTileSaveResult", () => {
    it("reports success only when every tile saved", () => {
      expect(describeTileSaveResult(50, 50)).toEqual({
        ok: true,
        message: "Route and maps saved for offline use",
      });
    });

    it("reports a partial-failure error when some but not all tiles saved", () => {
      const result = describeTileSaveResult(30, 50);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("30 of 50");
    });

    it("reports a total-failure error when nothing saved — this must not read as success just because downloadRouteTiles didn't throw", () => {
      const result = describeTileSaveResult(0, 50);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/couldn't download/i);
    });
  });

  describe("isRouteTileSetTruncated / estimateTileCount", () => {
    it("is false for an ordinary short route", () => {
      expect(isRouteTileSetTruncated(shortRoute)).toBe(false);
      expect(estimateTileCount(shortRoute)).toBeGreaterThan(0);
    });

    it("is true once a route needs more tiles than the MAX_TILES cap, and estimateTileCount stays capped", async () => {
      // A route sprawling across many degrees of longitude touches far more
      // distinct tiles at the finer zoom levels than MAX_TILES allows.
      const sprawling: RidePoint[] = Array.from({ length: 400 }, (_, i) => point(10, -170 + i));
      expect(isRouteTileSetTruncated(sprawling)).toBe(true);

      // The URL list is the capped tile set plus the shared glyph files.
      vi.stubGlobal("caches", makeFakeCaches());
      stubFetch(() => new Response("tile"));
      const urls = await tileUrlsForRoute(sprawling);
      expect(urls.length).toBeGreaterThan(estimateTileCount(sprawling));
      expect(urls.filter((url) => url.endsWith(".pbf") && !url.includes("/fonts/"))).toHaveLength(
        estimateTileCount(sprawling),
      );
    });
  });
});
