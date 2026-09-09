/**
 * Serves the generated world (`world.mjs`) to MapLibre as OpenMapTiles-schema
 * vector tiles, so the app's own `cycling-style.ts` draws it with no changes.
 *
 * This exists because a screenshot run has to work without reaching the real
 * tile host — a sandboxed CI box, an offline laptop, or a network policy that
 * blocks it. When the real host is reachable, `capture.mjs` uses it instead
 * and none of this is touched.
 *
 * Labels need SDF glyphs, which `fontnik` builds from a TTF. Both are
 * optional: without them the basemap still draws, just with no place or road
 * names.
 */

import GeoJSONVT from "geojson-vt";
import vtpbf from "vt-pbf";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/** Highest zoom the real providers publish; MapLibre overzooms past it. */
const MAX_ZOOM = 14;

const FONT_SOURCES = {
  "Noto Sans Regular":
    "https://raw.githubusercontent.com/openmaptiles/fonts/master/noto-sans/NotoSans-Regular.ttf",
  "Noto Sans Bold":
    "https://raw.githubusercontent.com/openmaptiles/fonts/master/noto-sans/NotoSans-Bold.ttf",
};

const CACHE_DIR = path.join(process.cwd(), "node_modules", ".cache", "hodora-screenshots");

/** Indexes every layer once; tiles are then cut on demand as MapLibre asks for them. */
export function createTileSource(world) {
  const indexes = new Map();
  for (const [name, collection] of Object.entries(world.layers)) {
    if (!collection.features.length) continue;
    indexes.set(
      name,
      new GeoJSONVT(collection, {
        maxZoom: MAX_ZOOM,
        indexMaxZoom: 10,
        indexMaxPoints: 0,
        tolerance: 2,
        extent: 4096,
        buffer: 64,
      }),
    );
  }

  return {
    /** TileJSON the style points at, so MapLibre resolves tiles the same way it does for real. */
    tilejson(tileUrlTemplate) {
      const lonLats = world.layers.place.features.map((f) => f.geometry.coordinates);
      const lons = lonLats.map((c) => c[0]);
      const lats = lonLats.map((c) => c[1]);
      return {
        tilejson: "2.2.0",
        name: "hodora-screenshot-basemap",
        format: "pbf",
        scheme: "xyz",
        tiles: [tileUrlTemplate],
        minzoom: 0,
        maxzoom: MAX_ZOOM,
        bounds: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
        vector_layers: [...indexes.keys()].map((id) => ({ id, fields: {} })),
      };
    },

    /** One `.pbf`, or an empty body where the world has nothing to draw. */
    tile(z, x, y) {
      const layers = {};
      for (const [name, index] of indexes) {
        const tile = index.getTile(z, x, y);
        if (tile && tile.features.length) layers[name] = tile;
      }
      if (!Object.keys(layers).length) return Buffer.alloc(0);
      return Buffer.from(vtpbf.fromGeojsonVt(layers, { version: 2, extent: 4096 }));
    },
  };
}

async function cachedFile(name, produce) {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, name);
  if (existsSync(file)) return readFile(file);
  const data = await produce();
  await writeFile(file, data);
  return data;
}

/**
 * Builds SDF glyph ranges for the two fonts the style asks for. Returns a
 * lookup, or `null` when `fontnik` isn't installed or the fonts can't be
 * fetched — the caller then serves empty glyph responses and the map draws
 * without labels.
 */
export async function createGlyphSource({ log = () => {} } = {}) {
  let fontnik;
  try {
    fontnik = (await import("fontnik")).default ?? (await import("fontnik"));
  } catch {
    log("fontnik not installed — stand-in basemap will have no labels");
    return null;
  }

  const ranges = [
    [0, 255],
    [256, 511],
  ];
  const glyphs = new Map();

  for (const [fontstack, url] of Object.entries(FONT_SOURCES)) {
    let ttf;
    try {
      ttf = await cachedFile(`${fontstack.replace(/\s+/g, "-")}.ttf`, async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
        return Buffer.from(await response.arrayBuffer());
      });
    } catch (error) {
      log(`could not fetch ${fontstack} (${error.message}) — basemap labels disabled`);
      return null;
    }

    for (const [start, end] of ranges) {
      const key = `${fontstack}/${start}-${end}`;
      const pbf = await cachedFile(
        `${key.replace(/[\s/]/g, "-")}.pbf`,
        () =>
          new Promise((resolve, reject) => {
            fontnik.range({ font: ttf, start, end }, (error, data) =>
              error ? reject(error) : resolve(data),
            );
          }),
      );
      glyphs.set(key, pbf);
    }
  }

  return {
    get(fontstack, range) {
      // A style can ask for a comma-joined stack; the first font we have wins.
      for (const font of fontstack.split(",")) {
        const hit = glyphs.get(`${font.trim()}/${range}`);
        if (hit) return hit;
      }
      return null;
    },
  };
}
