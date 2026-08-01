import { useEffect, useRef, useState } from "react";

export type LatLon = { lat: number; lon: number };

export type RejoinRoute = {
  /** the path to ride back to the track, following real ways when possible */
  path: LatLon[];
  /** length of that path in metres */
  distanceM: number;
  /** true when the geometry comes from a cycling router, false for the straight-line fallback */
  routed: boolean;
};

const OSRM_BIKE = "https://routing.openstreetmap.de/routed-bike/route/v1/bike";
const BROUTER = "https://brouter.de/brouter";

function metresBetween(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pathLength(path: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) total += metresBetween(path[i - 1], path[i]);
  return total;
}

function toPath(coords: [number, number][]): LatLon[] {
  return coords.map(([lon, lat]) => ({ lat, lon }));
}

async function fetchOsrmBike(from: LatLon, to: LatLon, signal: AbortSignal) {
  const url = `${OSRM_BIKE}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`OSRM ${response.status}`);
  const data = await response.json();
  const coords = data?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) throw new Error("OSRM: no geometry");
  return { path: toPath(coords), distanceM: Number(data.routes[0].distance) || 0 };
}

async function fetchBrouter(from: LatLon, to: LatLon, signal: AbortSignal) {
  const url = `${BROUTER}?lonlats=${from.lon},${from.lat}|${to.lon},${to.lat}&profile=trekking&alternativeidx=0&format=geojson`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`BRouter ${response.status}`);
  const data = await response.json();
  const coords = data?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) throw new Error("BRouter: no geometry");
  const path = toPath(coords.map((c: number[]) => [c[0], c[1]] as [number, number]));
  const declared = Number(data.features[0]?.properties?.["track-length"]);
  return { path, distanceM: Number.isFinite(declared) ? declared : pathLength(path) };
}

/**
 * Bike-friendly path from the rider back to the track. Falls back to a straight
 * line when both routers are unreachable (offline rides, remote areas).
 */
export async function fetchCyclingRoute(
  from: LatLon,
  to: LatLon,
  signal: AbortSignal,
): Promise<RejoinRoute> {
  for (const attempt of [fetchOsrmBike, fetchBrouter]) {
    try {
      const result = await attempt(from, to, signal);
      return { ...result, routed: true };
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  return { path: [from, to], distanceM: metresBetween(from, to), routed: false };
}

/**
 * Keeps a cycling rejoin route in sync with the rider while they are off track.
 * Re-routes only after meaningful movement so navigation stays cheap and calm.
 */
export function useRejoinRoute(
  from: LatLon | null,
  to: LatLon | null,
  active: boolean,
  { minMoveM = 30, minIntervalMs = 8000 } = {},
): { route: RejoinRoute | null; loading: boolean } {
  const [route, setRoute] = useState<RejoinRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const lastRef = useRef<{ from: LatLon; to: LatLon; at: number } | null>(null);

  useEffect(() => {
    if (!active || !from || !to) {
      lastRef.current = null;
      setRoute(null);
      setLoading(false);
      return;
    }

    const last = lastRef.current;
    const moved =
      !last ||
      metresBetween(last.from, from) > minMoveM ||
      metresBetween(last.to, to) > minMoveM;
    if (!moved && Date.now() - (last?.at ?? 0) < minIntervalMs) return;

    lastRef.current = { from, to, at: Date.now() };
    const controller = new AbortController();
    setLoading(true);
    fetchCyclingRoute(from, to, controller.signal)
      .then((result) => setRoute(result))
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, from?.lat, from?.lon, to?.lat, to?.lon]);

  return { route, loading };
}
