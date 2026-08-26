import { useEffect, useRef, useState } from "react";
import { haversine } from "./gpx";
import { fetchRoute, type LatLon, type RoutedPath } from "./routing";

export type { LatLon } from "./routing";
export type RejoinRoute = RoutedPath;

/**
 * Bike-friendly path from the rider back to the track. Falls back to a straight
 * line when both routers are unreachable (offline rides, remote areas).
 */
export async function fetchCyclingRoute(
  from: LatLon,
  to: LatLon,
  signal: AbortSignal,
): Promise<RejoinRoute> {
  return fetchRoute([from, to], { signal });
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
      // Resets to the "no rejoin needed" state when navigation stops being
      // off-route — not deriving state from props/state during render, so
      // there's no callback to move this into.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoute(null);
      setLoading(false);
      return;
    }

    const last = lastRef.current;
    const moved =
      !last ||
      haversine(last.from.lat, last.from.lon, from.lat, from.lon) > minMoveM ||
      haversine(last.to.lat, last.to.lon, to.lat, to.lon) > minMoveM;
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
