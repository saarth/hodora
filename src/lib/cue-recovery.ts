/**
 * "Recover directions" for an imported GPX with no router history: BRouter's
 * step format isn't documented/stable enough to parse (see routing.ts), so
 * this runs the track back through OSRM instead — downsampled to a
 * manageable number of via-points, since sending every dense track point as
 * a routing waypoint would be both slow and unnecessary for streets, which
 * change far less often than the recorded point spacing.
 */
import type { RidePoint } from "./gpx";
import { fetchOsrmRoute, pathLengthM, type LatLon } from "./routing";
import type { RideCue } from "./cues";

const MAX_WAYPOINTS = 100;

/** Evenly-spaced subsample of up to `maxPoints` points, always keeping the first and last. */
function downsample(points: RidePoint[], maxPoints: number): LatLon[] {
  if (points.length <= maxPoints) return points.map((p) => ({ lat: p.lat, lon: p.lon }));
  const step = (points.length - 1) / (maxPoints - 1);
  const out: LatLon[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const point = points[Math.round(i * step)];
    out.push({ lat: point.lat, lon: point.lon });
  }
  return out;
}

/**
 * Re-routes a downsampled version of `points` through OSRM to recover named
 * turn-by-turn directions, then rescales the result's distances onto the
 * original track's actual length so the recovered cues line up with it. The
 * recovered route rarely matches the original to the meter (waypoint
 * snapping, minor road choice differences), so this is a best-effort
 * approximation, not an exact map-match — good enough to show which street
 * a turn is onto, not precise enough to trust for anything safety-critical.
 *
 * Returns an empty array if OSRM couldn't route it (offline, no nearby road
 * network) or returned no step data — callers should treat that the same as
 * "nothing recovered" rather than a hard failure, except that network
 * errors are left to propagate so the caller can tell the rider it failed.
 */
export async function recoverCuesForRide(
  points: RidePoint[],
  signal: AbortSignal,
): Promise<RideCue[]> {
  if (points.length < 2) return [];
  const waypoints = downsample(points, MAX_WAYPOINTS);
  const result = await fetchOsrmRoute(waypoints, signal);
  if (result.cues.length === 0) return [];

  const originalTotalM = points[points.length - 1].d;
  const recomputedTotalM = result.distanceM || pathLengthM(result.path);
  if (!(recomputedTotalM > 0) || !(originalTotalM > 0)) return [];

  const ratio = originalTotalM / recomputedTotalM;
  return result.cues.map((cue) => ({
    ...cue,
    atM: Math.min(originalTotalM, Math.max(0, cue.atM * ratio)),
  }));
}
