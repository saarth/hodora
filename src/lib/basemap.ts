/**
 * Which vector-tile provider the basemap is drawn from.
 *
 * The cycling style (`cycling-style.ts`) is written against the
 * OpenMapTiles schema, and two providers serve that schema:
 *
 * - **OpenFreeMap** (default) — free, no API key, no signup, so the app
 *   stays zero-config for self-hosters. This replaced a CARTO raster
 *   basemap: CARTO ended keyless access to `basemaps.cartocdn.com` and now
 *   stamps "API KEY REQUIRED" across every tile served without one.
 * - **MapTiler** — used instead when `VITE_MAPTILER_KEY` is set. Same
 *   schema, so the style itself doesn't change; this is the upgrade path
 *   for anyone who wants an SLA, since OpenFreeMap is donation-funded and
 *   explicitly offers no uptime guarantee.
 *
 * Everything that needs to know where tiles come from — the style, the
 * offline downloader, the service worker's cache rules — resolves it here
 * rather than hardcoding a host.
 */

const maptilerKey = (import.meta.env.VITE_MAPTILER_KEY as string | undefined)?.trim();

/** True when VITE_MAPTILER_KEY is set and MapTiler should serve tiles instead of OpenFreeMap. */
export const useMapTiler = Boolean(maptilerKey);

/**
 * OpenFreeMap publishes each planet build under a dated path and only
 * advertises the current one through this TileJSON. The unversioned
 * `/planet/{z}/{x}/{y}.pbf` form looks like it works — it answers 200 —
 * but every response is zero bytes, so the map silently renders empty.
 * Always resolve the real tile template through here.
 */
export const OPENFREEMAP_TILEJSON = "https://tiles.openfreemap.org/planet";

/** Highest zoom either provider actually publishes; MapLibre overzooms past it. */
export const VECTOR_MAXZOOM = 14;

export const BASEMAP_ATTRIBUTION = useMapTiler
  ? '© <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
  : '© <a href="https://openfreemap.org/" target="_blank">OpenFreeMap</a> · © <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors';

export const glyphsUrl = useMapTiler
  ? `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${maptilerKey}`
  : "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

/**
 * The style's vector source. MapTiler's tile template is static, so it can
 * be inlined; OpenFreeMap's is versioned, so hand MapLibre the TileJSON URL
 * and let it resolve the current build.
 */
export function vectorSource(): Record<string, unknown> {
  if (useMapTiler) {
    return {
      type: "vector",
      tiles: [`https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${maptilerKey}`],
      maxzoom: VECTOR_MAXZOOM,
      attribution: BASEMAP_ATTRIBUTION,
    };
  }
  return {
    type: "vector",
    url: OPENFREEMAP_TILEJSON,
    attribution: BASEMAP_ATTRIBUTION,
  };
}

/**
 * Resolves `{z}/{x}/{y}` into a tile URL. For MapTiler that needs no
 * network; for OpenFreeMap the caller has to supply the versioned template
 * it got from the TileJSON (see `resolveTileTemplate` in offline-tiles.ts).
 */
export function tileUrlFrom(template: string, z: number, x: number, y: number): string {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

/** Static tile template, when the provider has one. `null` means it must be resolved from a TileJSON. */
export const staticTileTemplate = useMapTiler
  ? `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${maptilerKey}`
  : null;

/** Fonts the cycling style asks for, and the glyph ranges that cover Latin place names. */
const FONTS = ["Noto Sans Regular", "Noto Sans Bold"];
const GLYPH_RANGES = ["0-255", "256-511"];

/**
 * Glyph URLs to cache alongside a route's tiles. Without them an offline
 * map draws its geometry but no labels at all, which makes it much harder
 * to navigate by. Two ranges cover Latin and Latin Extended-A — enough for
 * European place names, which is where the label text actually comes from
 * for the routes this app is used on.
 */
export function glyphUrlsForOffline(): string[] {
  return FONTS.flatMap((font) =>
    GLYPH_RANGES.map((range) =>
      glyphsUrl.replace("{fontstack}", encodeURIComponent(font)).replace("{range}", range),
    ),
  );
}
