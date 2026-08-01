/**
 * Route discovery: finds signposted cycle routes from OpenStreetMap (Overpass)
 * and generates loop rides with a cycling router. All client side — no keys.
 */
import { haversine, type RidePoint } from "./gpx";
import { type LatLon } from "./rejoin";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const OSRM_BIKE = "https://routing.openstreetmap.de/routed-bike/route/v1/bike";

export type DiscoveredRoute = {
  id: string;
  name: string;
  kind: "osm" | "loop";
  /** e.g. "Regional network" or "Generated loop" */
  subtitle: string;
  path: LatLon[];
  distanceM: number;
};

export function pathLengthM(path: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += haversine(path[i - 1].lat, path[i - 1].lon, path[i].lat, path[i].lon);
  }
  return total;
}

/** Convert a discovered path into ride points (flat elevation — OSM has none). */
export function toRidePoints(path: LatLon[]): RidePoint[] {
  let d = 0;
  return path.map((point, index) => {
    if (index > 0) {
      d += haversine(path[index - 1].lat, path[index - 1].lon, point.lat, point.lon);
    }
    return { lat: point.lat, lon: point.lon, ele: 0, d };
  });
}

export function boundsOf(path: LatLon[]) {
  const lats = path.map((p) => p.lat);
  const lons = path.map((p) => p.lon);
  return {
    minLat: Math.min(...lats),
    minLon: Math.min(...lons),
    maxLat: Math.max(...lats),
    maxLon: Math.max(...lons),
  };
}

const NETWORK_LABEL: Record<string, string> = {
  icn: "International network",
  ncn: "National network",
  rcn: "Regional network",
  lcn: "Local network",
};

type OverpassWay = {
  type: string;
  id: number;
  geometry?: { lat: number; lon: number }[];
};

type OverpassRelation = {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
  members?: { type: string; ref: number; geometry?: { lat: number; lon: number }[] }[];
};

/** Stitch relation member ways into one continuous-ish polyline. */
function stitch(members: OverpassRelation["members"]): LatLon[] {
  const segments = (members ?? [])
    .filter((member) => member.type === "way" && (member.geometry?.length ?? 0) > 1)
    .map((member) => member.geometry!.map((g) => ({ lat: g.lat, lon: g.lon })));
  if (segments.length === 0) return [];

  const remaining = segments.slice(1);
  const path = [...segments[0]];
  while (remaining.length > 0) {
    const tail = path[path.length - 1];
    let bestIndex = 0;
    let bestDistance = Infinity;
    let flip = false;
    remaining.forEach((segment, index) => {
      const start = haversine(tail.lat, tail.lon, segment[0].lat, segment[0].lon);
      const end = haversine(
        tail.lat,
        tail.lon,
        segment[segment.length - 1].lat,
        segment[segment.length - 1].lon,
      );
      const distance = Math.min(start, end);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
        flip = end < start;
      }
    });
    // A gap larger than 2 km means the rest belongs to a detached branch.
    if (bestDistance > 2000) break;
    const next = remaining.splice(bestIndex, 1)[0];
    path.push(...(flip ? [...next].reverse() : next));
  }
  return path;
}

async function overpass(query: string, signal: AbortSignal): Promise<any> {
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

/** Signposted cycle routes whose ways pass near the given centre. */
export async function findNearbyRoutes(
  center: LatLon,
  radiusM: number,
  signal: AbortSignal,
): Promise<DiscoveredRoute[]> {
  const radius = Math.round(Math.min(Math.max(radiusM, 2000), 40000));
  const query = `[out:json][timeout:40];
relation["route"="bicycle"]["name"](around:${radius},${center.lat.toFixed(5)},${center.lon.toFixed(5)});
out geom 40;`;
  const data = await overpass(query, signal);
  const elements: (OverpassRelation | OverpassWay)[] = data?.elements ?? [];

  const routes: DiscoveredRoute[] = [];
  for (const element of elements) {
    if (element.type !== "relation") continue;
    const relation = element as OverpassRelation;
    const path = stitch(relation.members);
    if (path.length < 2) continue;
    const distanceM = pathLengthM(path);
    // Skip tiny connector segments — they aren't rides.
    if (distanceM < 5000) continue;
    const tags = relation.tags ?? {};
    const network = tags["network"] ?? "";
    routes.push({
      id: `osm-${relation.id}`,
      name: tags["name"] ?? "Unnamed cycle route",
      kind: "osm",
      subtitle:
        NETWORK_LABEL[network] ??
        (tags["operator"] ? tags["operator"] : "Signposted cycle route"),
      path,
      distanceM,
    });
  }
  return routes.sort((a, b) => b.distanceM - a.distanceM).slice(0, 12);
}

function offset(center: LatLon, bearingDeg: number, distanceM: number): LatLon {
  const R = 6371000;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (center.lat * Math.PI) / 180;
  const lon1 = (center.lon * Math.PI) / 180;
  const angular = distanceM / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

async function routeVia(points: LatLon[], signal: AbortSignal) {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const response = await fetch(`${OSRM_BIKE}/${coords}?overview=full&geometries=geojson`, {
    signal,
  });
  if (!response.ok) throw new Error(`OSRM ${response.status}`);
  const data = await response.json();
  const geometry = data?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(geometry) || geometry.length < 2) throw new Error("No route geometry");
  return {
    path: geometry.map(([lon, lat]: [number, number]) => ({ lat, lon })),
    distanceM: Number(data.routes[0].distance) || 0,
  };
}

/**
 * Loop rides of roughly the requested length, starting and finishing at the
 * given point. Each loop heads out on a different bearing.
 */
export async function generateLoops(
  start: LatLon,
  targetM: number,
  signal: AbortSignal,
  count = 3,
): Promise<DiscoveredRoute[]> {
  // Triangle-ish loop: three waypoints on a circle sized so the ridden
  // distance lands near the target.
  const radius = (targetM / (2 * Math.PI)) * 0.9;
  const bearings = Array.from({ length: count }, (_, index) => (360 / count) * index + 20);

  const results = await Promise.allSettled(
    bearings.map(async (bearing, index) => {
      const waypoints = [
        start,
        offset(start, bearing, radius),
        offset(start, bearing + 120, radius),
        offset(start, bearing + 240, radius),
        start,
      ];
      const routed = await routeVia(waypoints, signal);
      return {
        id: `loop-${index}`,
        name: `${Math.round(routed.distanceM / 1000)} km loop · ${compass(bearing)}`,
        kind: "loop" as const,
        subtitle: "Generated loop from your start point",
        path: routed.path,
        distanceM: routed.distanceM,
      };
    }),
  );

  const loops: DiscoveredRoute[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") loops.push(result.value);
  }
  return loops;
}

function compass(bearingDeg: number): string {
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return names[Math.round(((bearingDeg % 360) / 45)) % 8];
}
