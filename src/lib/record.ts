/**
 * Ride recording: turns a live GPS stream into a track, independent of any
 * pre-existing route to follow. `acceptRecordingFix` is the one bit of real
 * math (filtering GPS jitter while stationary) — kept pure and separate from
 * the /record route component so it's testable without a real
 * geolocation/DOM environment, same pattern as findProximityAlert in nav.ts.
 */
import { haversine, type RawTrackPoint } from "./gpx";

export type RecordingFix = {
  lat: number;
  lon: number;
  /** GPS altitude in meters, or null when the device didn't report one */
  ele: number | null;
  /** elapsed recording seconds (paused time excluded) */
  tSec: number;
};

/** Minimum movement (meters) from the last accepted point before a new fix is recorded — filters GPS jitter while stationary (traffic lights, regroup stops) from inflating distance/elevation gain. */
export const MIN_RECORDING_STEP_M = 3;

/**
 * Appends `fix` as a new track point if it's moved far enough from the last
 * accepted point (the first fix is always accepted). Returns the same array
 * reference when the fix is rejected, so callers can skip a state update
 * entirely on a no-op tick.
 */
export function acceptRecordingFix(
  points: readonly RawTrackPoint[],
  fix: RecordingFix,
): RawTrackPoint[] {
  const last = points[points.length - 1];
  if (last) {
    const movedM = haversine(last.lat, last.lon, fix.lat, fix.lon);
    if (movedM < MIN_RECORDING_STEP_M) return points as RawTrackPoint[];
  }
  return [...points, { lat: fix.lat, lon: fix.lon, ele: fix.ele ?? 0, gap: false, t: fix.tSec }];
}
