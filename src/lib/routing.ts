/**
 * Shared OSM bike routing: turns a list of waypoints into a real cycling
 * path via public routers, entirely client side — no keys required. Used by
 * the route planner (multi-waypoint, profile-aware) and by the rejoin helper
 * (two points, speed matters more than profile choice).
 */
import { haversine } from "./gpx";
import { osrmDirection, type RideCue } from "./cues";

export type LatLon = {
  lat: number;
  lon: number;
  /** elevation in meters, when the router's geometry included one (BRouter only — OSRM doesn't) */
  ele?: number;
};

/** BRouter profile names, as accepted by the public/self-hosted BRouter server. */
export type BikeProfile = "trekking" | "fastbike" | "safety";

export const BIKE_PROFILES: { value: BikeProfile; label: string; description: string }[] = [
  { value: "trekking", label: "Trekking", description: "Balanced, all-around cycling route" },
  { value: "fastbike", label: "Fast", description: "Prefers direct roads for speed" },
  { value: "safety", label: "Safety", description: "Prefers quieter, bike-friendly ways" },
];

const OSRM_BIKE = "https://routing.openstreetmap.de/routed-bike/route/v1/bike";
const BROUTER_DEFAULT = "https://brouter.de/brouter";

/**
 * Self-hosters can point this at their own BRouter (or BRouter-compatible)
 * instance via VITE_BROUTER_URL — see .env.example. Defaults to the public
 * brouter.de server, same as before this was configurable.
 */
function brouterBaseUrl(): string {
  const configured = (import.meta.env.VITE_BROUTER_URL as string | undefined)?.trim();
  return configured && configured.length > 0 ? configured.replace(/\/$/, "") : BROUTER_DEFAULT;
}

export function pathLengthM(path: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += haversine(path[i - 1].lat, path[i - 1].lon, path[i].lat, path[i].lon);
  }
  return total;
}

/**
 * Converts GeoJSON `[lon, lat]`/`[lon, lat, ele]` coordinate tuples to our
 * point shape, keeping a 3rd (elevation) value when the router included one
 * — BRouter's geojson track coordinates carry elevation this way; OSRM's
 * don't, so its paths just come out with `ele` unset, same as before.
 */
function toPath(coords: number[][]): LatLon[] {
  return coords.map(([lon, lat, ele]) => ({
    lat,
    lon,
    ...(Number.isFinite(ele) ? { ele } : {}),
  }));
}

/**
 * Walks an OSRM route's legs/steps into a flat cue list with cumulative
 * distance offsets, so multi-waypoint routes get one continuous instruction
 * list instead of restarting at zero for every leg. A step's `maneuver`
 * happens at the start of that step, so the running offset *before* adding
 * the step's own distance is exactly where the instruction applies.
 */
function parseOsrmSteps(route: {
  legs?: {
    steps?: { distance?: number; name?: string; maneuver?: { type?: string; modifier?: string } }[];
  }[];
}): RideCue[] {
  const cues: RideCue[] = [];
  let offsetM = 0;
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      if (step.maneuver) {
        cues.push({
          atM: offsetM,
          direction: osrmDirection(step.maneuver.type ?? "", step.maneuver.modifier ?? null),
          name: step.name?.trim() || null,
        });
      }
      offsetM += Number(step.distance) || 0;
    }
  }
  return cues;
}

/** Routes through every waypoint in order via the public OSRM bike server, capturing turn-by-turn step instructions along the way. */
export async function fetchOsrmRoute(
  points: LatLon[],
  signal: AbortSignal,
): Promise<{ path: LatLon[]; distanceM: number; cues: RideCue[] }> {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const response = await fetch(
    `${OSRM_BIKE}/${coords}?overview=full&geometries=geojson&steps=true`,
    { signal },
  );
  if (!response.ok) throw new Error(`OSRM ${response.status}`);
  const data = await response.json();
  const route = data?.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) throw new Error("OSRM: no geometry");
  return {
    path: toPath(coordinates),
    distanceM: Number(route.distance) || 0,
    cues: parseOsrmSteps(route),
  };
}

/**
 * Routes through every waypoint in order via BRouter, respecting the chosen
 * cycling profile. Doesn't return `cues`: BRouter's public server has no
 * documented, stable step-instruction format to parse (unlike OSRM's
 * `steps=true`), so a route that comes back from here falls back to
 * geometry-detected turns for its cue sheet (see `buildCueSheet` in
 * cues.ts) instead of risking a silently-wrong parse of an undocumented
 * field.
 */
export async function fetchBrouterRoute(
  points: LatLon[],
  profile: BikeProfile,
  signal: AbortSignal,
): Promise<{ path: LatLon[]; distanceM: number; cues: RideCue[] }> {
  const lonlats = points.map((p) => `${p.lon},${p.lat}`).join("|");
  const url = `${brouterBaseUrl()}?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`BRouter ${response.status}`);
  const data = await response.json();
  const coordinates = data?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2)
    throw new Error("BRouter: no geometry");
  const path = toPath(coordinates);
  const declared = Number(data.features[0]?.properties?.["track-length"]);
  return { path, distanceM: Number.isFinite(declared) ? declared : pathLengthM(path), cues: [] };
}

export type RoutedPath = {
  /** the path through all waypoints, following real ways when possible */
  path: LatLon[];
  /** length of that path in metres */
  distanceM: number;
  /** true when the geometry comes from a cycling router, false for the straight-line fallback */
  routed: boolean;
  /** turn-by-turn step instructions the router provided, if any — see fetchOsrmRoute/fetchBrouterRoute */
  cues: RideCue[];
};

function straightLineFallback(points: LatLon[]): RoutedPath {
  return { path: points, distanceM: pathLengthM(points), routed: false, cues: [] };
}

/**
 * Bike-friendly route through the given waypoints (in order), trying one
 * router then the other. Falls back to straight lines between waypoints
 * when both routers are unreachable (offline, remote areas, self-hosted
 * BRouter misconfigured).
 *
 * `preferBrouter` puts BRouter first so the requested `profile` is actually
 * honored — OSRM's public bike profile is fixed and ignores it, so it only
 * makes a good *fallback*, not a good first choice when profile matters.
 */
export async function fetchRoute(
  points: LatLon[],
  {
    profile = "trekking",
    preferBrouter = false,
    signal,
  }: { profile?: BikeProfile; preferBrouter?: boolean; signal: AbortSignal },
): Promise<RoutedPath> {
  if (points.length < 2) return straightLineFallback(points);

  const attempts = preferBrouter
    ? [() => fetchBrouterRoute(points, profile, signal), () => fetchOsrmRoute(points, signal)]
    : [() => fetchOsrmRoute(points, signal), () => fetchBrouterRoute(points, profile, signal)];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      return { ...result, routed: true };
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  return straightLineFallback(points);
}
