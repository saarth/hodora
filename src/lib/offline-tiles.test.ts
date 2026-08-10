import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadRouteTiles,
  estimateTileCount,
  isRouteMapSaved,
  isRouteTileSetTruncated,
  tileUrlsForRoute,
} from "./offline-tiles";
import type { RidePoint } from "./gpx";

const point = (lat: number, lon: number, d = 0): RidePoint => ({ lat, lon, ele: 0, d });
const shortRoute: RidePoint[] = [point(51.5, -0.1), point(51.51, -0.11), point(51.52, -0.12)];

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
      expect(await isRouteMapSaved(shortRoute)).toBe(false);
    });

    it("returns true only once every single tile the route needs is cached, not just a sample", async () => {
      const fakeCaches = makeFakeCaches();
      vi.stubGlobal("caches", fakeCaches);
      const cache = await fakeCaches.open("map-tiles");
      const urls = tileUrlsForRoute(shortRoute);

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
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => {
          call++;
          // Every third tile fails (simulating flaky/rate-limited tile CDN responses).
          const ok = call % 3 !== 0;
          return Promise.resolve(new Response("tile", { status: ok ? 200 : 429 }));
        }),
      );

      const { saved, total } = await downloadRouteTiles(shortRoute);
      expect(total).toBe(tileUrlsForRoute(shortRoute).length);
      expect(saved).toBeLessThan(total);
      expect(saved).toBe(total - Math.floor(total / 3));
    });

    it("counts an already-cached tile as saved without re-fetching it", async () => {
      const fakeCaches = makeFakeCaches();
      vi.stubGlobal("caches", fakeCaches);
      const cache = await fakeCaches.open("map-tiles");
      const urls = tileUrlsForRoute(shortRoute);
      for (const url of urls) await cache.put(url, new Response("tile"));

      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const { saved, total } = await downloadRouteTiles(shortRoute);
      expect(saved).toBe(total);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("isRouteTileSetTruncated / estimateTileCount", () => {
    it("is false for an ordinary short route", () => {
      expect(isRouteTileSetTruncated(shortRoute)).toBe(false);
      expect(estimateTileCount(shortRoute)).toBeGreaterThan(0);
    });

    it("is true once a route needs more tiles than the MAX_TILES cap, and estimateTileCount stays capped", () => {
      // A route sprawling across many degrees of longitude touches far more
      // distinct tiles at the finer zoom levels than MAX_TILES allows.
      const sprawling: RidePoint[] = Array.from({ length: 400 }, (_, i) => point(10, -170 + i));
      expect(isRouteTileSetTruncated(sprawling)).toBe(true);
      expect(estimateTileCount(sprawling)).toBe(tileUrlsForRoute(sprawling).length);
    });
  });
});
