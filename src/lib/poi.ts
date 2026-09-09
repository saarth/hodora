/**
 * Points of interest along a route (train stations, cafes, drinking water,
 * bike shops, toilets) from OpenStreetMap via Overpass — same public, no-key
 * infrastructure discover.ts already uses for signposted routes/loops.
 * Fetched on demand for a route's bounding box (padded a little), not
 * continuously as the map pans, to stay a good citizen of the free public
 * Overpass servers.
 */
import type { LatLon } from "./routing";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export type PoiCategory = "train_station" | "cafe" | "water" | "bike_shop" | "toilets";

export const POI_CATEGORIES: { value: PoiCategory; label: string }[] = [
  { value: "train_station", label: "Train stations" },
  { value: "cafe", label: "Cafes" },
  { value: "water", label: "Water" },
  { value: "bike_shop", label: "Bike shops" },
  { value: "toilets", label: "Toilets" },
];

/**
 * The CSS custom property each category is drawn with. RouteMap's map layer
 * and every legend read this same table, so a pin on the map and its swatch
 * in the UI can't drift apart.
 */
export const POI_COLOR_VAR: Record<PoiCategory, string> = {
  train_station: "--color-transit",
  cafe: "--color-chart-3",
  water: "--color-chart-4",
  bike_shop: "--color-chart-5",
  toilets: "--color-chart-2",
};

export type Poi = {
  id: string;
  lat: number;
  lon: number;
  category: PoiCategory;
  name: string | null;
};

const CATEGORY_FILTERS: Record<PoiCategory, string> = {
  // Heavy/underground rail is filtered out by `station`: a subway or light
  // rail stop is tagged `railway=station` too, and neither takes bikes the
  // way a mainline train does. `halt` keeps the small unstaffed stops, which
  // are often the useful ones for starting or bailing out of a ride.
  train_station: '["railway"~"^(station|halt)$"]["station"!~"subway|light_rail"]',
  cafe: '["amenity"="cafe"]',
  water: '["amenity"="drinking_water"]',
  bike_shop: '["shop"="bicycle"]',
  toilets: '["amenity"="toilets"]',
};

function categoryForTags(tags: Record<string, string>): PoiCategory | null {
  if (
    (tags.railway === "station" || tags.railway === "halt") &&
    tags.station !== "subway" &&
    tags.station !== "light_rail"
  ) {
    return "train_station";
  }
  if (tags.amenity === "cafe") return "cafe";
  if (tags.amenity === "drinking_water") return "water";
  if (tags.shop === "bicycle") return "bike_shop";
  if (tags.amenity === "toilets") return "toilets";
  return null;
}

async function overpass(query: string, signal: AbortSignal): Promise<unknown> {
  let lastError: unknown = new Error("Overpass unavailable");
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        signal,
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      return await response.json();
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/** Bounding box area cap so a very long point-to-point route can't trigger a huge, slow Overpass query. */
const MAX_BBOX_DEGREES_SQ = 4; // roughly a 2°x2° box — generous for any single day's ride

export type Bounds = { minLat: number; minLon: number; maxLat: number; maxLon: number };

/**
 * Fetches POIs in the given categories within `bounds`, padded outward by
 * `padDeg` (default ~500m) so amenities just off the route's bounding box
 * still show up. Returns an empty list (rather than throwing) when the box
 * is too large to query safely — callers can check `padded` bounds size
 * themselves beforehand if they want to warn the rider.
 */
export async function fetchPois(
  bounds: Bounds,
  categories: PoiCategory[],
  signal: AbortSignal,
  padDeg = 0.005,
): Promise<Poi[]> {
  if (categories.length === 0) return [];
  const padded: Bounds = {
    minLat: bounds.minLat - padDeg,
    minLon: bounds.minLon - padDeg,
    maxLat: bounds.maxLat + padDeg,
    maxLon: bounds.maxLon + padDeg,
  };
  const area = (padded.maxLat - padded.minLat) * (padded.maxLon - padded.minLon);
  if (area > MAX_BBOX_DEGREES_SQ) return [];

  const bbox = `${padded.minLat},${padded.minLon},${padded.maxLat},${padded.maxLon}`;
  const clauses = categories
    .map((category) => `node${CATEGORY_FILTERS[category]}(${bbox});`)
    .join("\n");
  const query = `[out:json][timeout:25];(${clauses});out center 300;`;

  const data = (await overpass(query, signal)) as { elements?: unknown[] };
  const elements = Array.isArray(data?.elements) ? data.elements : [];

  const pois: Poi[] = [];
  for (const raw of elements) {
    const el = raw as {
      type?: string;
      id?: number;
      lat?: number;
      lon?: number;
      center?: { lat?: number; lon?: number };
      tags?: Record<string, string>;
    };
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const category = categoryForTags(el.tags ?? {});
    if (!category) continue;
    pois.push({
      id: `${el.type ?? "node"}/${el.id}`,
      lat: lat as number,
      lon: lon as number,
      category,
      name: el.tags?.name?.trim() || null,
    });
  }
  return pois;
}

export function poiBounds(points: LatLon[]): Bounds {
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLon = points[0].lon;
  let maxLon = points[0].lon;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  return { minLat, minLon, maxLat, maxLon };
}

/**
 * The bounding box of the area visible around `center`, given the radius
 * RouteMap reports for the current view. Lets a screen without a route yet
 * — the planner, before any point is dropped — still ask for POIs in what
 * the rider is actually looking at.
 */
export function boundsAround(center: LatLon, radiusM: number): Bounds {
  const latDeg = radiusM / 111_320;
  // Meridians converge toward the poles, so a metre is worth more longitude
  // the further north/south you are. Clamped so a view near a pole can't
  // divide by ~0 and ask Overpass for the whole planet.
  const lonDeg = radiusM / (111_320 * Math.max(0.05, Math.cos((center.lat * Math.PI) / 180)));
  return {
    minLat: center.lat - latDeg,
    maxLat: center.lat + latDeg,
    minLon: center.lon - lonDeg,
    maxLon: center.lon + lonDeg,
  };
}

/** True when `point` sits inside `bounds` — used to tell whether the map has been panned off the area POIs were last fetched for. */
export function boundsContain(bounds: Bounds, point: LatLon): boolean {
  return (
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lon >= bounds.minLon &&
    point.lon <= bounds.maxLon
  );
}

export function poiCategoryLabel(category: PoiCategory): string {
  return POI_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
