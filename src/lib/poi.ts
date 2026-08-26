/**
 * Points of interest along a route (cafes, drinking water, bike shops,
 * toilets) from OpenStreetMap via Overpass — same public, no-key
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

export type PoiCategory = "cafe" | "water" | "bike_shop" | "toilets";

export const POI_CATEGORIES: { value: PoiCategory; label: string }[] = [
  { value: "cafe", label: "Cafes" },
  { value: "water", label: "Water" },
  { value: "bike_shop", label: "Bike shops" },
  { value: "toilets", label: "Toilets" },
];

export type Poi = {
  id: string;
  lat: number;
  lon: number;
  category: PoiCategory;
  name: string | null;
};

const CATEGORY_FILTERS: Record<PoiCategory, string> = {
  cafe: '["amenity"="cafe"]',
  water: '["amenity"="drinking_water"]',
  bike_shop: '["shop"="bicycle"]',
  toilets: '["amenity"="toilets"]',
};

function categoryForTags(tags: Record<string, string>): PoiCategory | null {
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

export function poiCategoryLabel(category: PoiCategory): string {
  return POI_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
