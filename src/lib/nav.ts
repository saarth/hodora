import { bearing, bearingDelta, haversine, type RidePoint } from "./gpx";

export type TurnDirection = "left" | "sharp-left" | "right" | "sharp-right";

export type Turn = {
  index: number;
  /** cumulative route distance in meters where the turn happens */
  at: number;
  direction: TurnDirection;
  /** signed angle, positive = right */
  angle: number;
};

/** Perpendicular-ish snap of a position onto the route. */
export type Snap = {
  index: number;
  /** distance from the position to the route in meters */
  offRouteM: number;
  /** cumulative route distance at the snapped point */
  progressM: number;
  /** latitude of the closest point on the route (the rejoin point) */
  lat: number;
  /** longitude of the closest point on the route (the rejoin point) */
  lon: number;
};

function directionFor(angle: number): TurnDirection {
  if (angle > 0) return angle >= 95 ? "sharp-right" : "right";
  return angle <= -95 ? "sharp-left" : "left";
}

/**
 * Detect turns by comparing the bearing of the ~30 m before a point with the
 * ~30 m after it. Consecutive detections are collapsed into one turn.
 */
export function detectTurns(points: RidePoint[], minAngle = 35): Turn[] {
  const turns: Turn[] = [];
  const span = 30;

  // Stop at a `gap` boundary (a real break between GPX <trkseg>s, e.g. a
  // ferry crossing) so a turn is never computed from the bearing across it.
  const findIndexAtDistance = (from: number, delta: number) => {
    const target = points[from].d + delta;
    let i = from;
    if (delta > 0) {
      while (i < points.length - 1 && points[i].d < target && !points[i + 1].gap) i++;
    } else {
      while (i > 0 && points[i].d > target && !points[i].gap) i--;
    }
    return i;
  };

  for (let i = 1; i < points.length - 1; i++) {
    const back = findIndexAtDistance(i, -span);
    const fwd = findIndexAtDistance(i, span);
    if (back === i || fwd === i) continue;

    const inBearing = bearing(points[back].lat, points[back].lon, points[i].lat, points[i].lon);
    const outBearing = bearing(points[i].lat, points[i].lon, points[fwd].lat, points[fwd].lon);
    const angle = bearingDelta(inBearing, outBearing);
    if (Math.abs(angle) < minAngle) continue;

    const last = turns[turns.length - 1];
    if (last && points[i].d - last.at < 25) {
      if (Math.abs(angle) > Math.abs(last.angle)) {
        last.index = i;
        last.at = points[i].d;
        last.angle = angle;
        last.direction = directionFor(angle);
      }
      continue;
    }

    turns.push({ index: i, at: points[i].d, angle, direction: directionFor(angle) });
  }

  return turns;
}

/**
 * Snap a live position onto the route using perpendicular projection onto each
 * route segment (not just the nearest vertex), so progress and off-route
 * distance stay accurate on long straight segments. Searches near the last
 * known index for speed, and falls back to a full scan when far away.
 */
export function snapToRoute(points: RidePoint[], lat: number, lon: number, lastIndex = 0): Snap {
  if (points.length === 0) return { index: 0, offRouteM: 0, progressM: 0, lat, lon };
  if (points.length === 1) {
    return {
      index: 0,
      offRouteM: haversine(lat, lon, points[0].lat, points[0].lon),
      progressM: points[0].d,
      lat: points[0].lat,
      lon: points[0].lon,
    };
  }

  // Local equirectangular projection in meters around the live position.
  const R = 6371000;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const toXY = (pLat: number, pLon: number) => ({
    x: ((pLon - lon) * Math.PI * R * cosLat) / 180,
    y: ((pLat - lat) * Math.PI * R) / 180,
  });

  const scan = (from: number, to: number) => {
    let bestIndex = from;
    let bestDist = Infinity;
    let bestProgress = points[from].d;
    let bestLat = points[from].lat;
    let bestLon = points[from].lon;

    for (let i = from; i < to; i++) {
      const a = toXY(points[i].lat, points[i].lon);
      const b = toXY(points[i + 1].lat, points[i + 1].lon);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      // t = normalized position of the perpendicular foot along the segment
      const t = lenSq > 0 ? Math.max(0, Math.min(1, (-a.x * dx - a.y * dy) / lenSq)) : 0;
      const px = a.x + t * dx;
      const py = a.y + t * dy;
      const dist = Math.hypot(px, py);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = t >= 0.5 ? i + 1 : i;
        bestProgress = points[i].d + t * (points[i + 1].d - points[i].d);
        bestLat = points[i].lat + t * (points[i + 1].lat - points[i].lat);
        bestLon = points[i].lon + t * (points[i + 1].lon - points[i].lon);
      }
    }

    return { bestIndex, bestDist, bestProgress, bestLat, bestLon };
  };

  const windowStart = Math.max(0, lastIndex - 40);
  const windowEnd = Math.min(points.length - 1, lastIndex + 200);
  let best = scan(windowStart, windowEnd);

  if (best.bestDist > 120) {
    const full = scan(0, points.length - 1);
    if (full.bestDist < best.bestDist) best = full;
  }

  return {
    index: best.bestIndex,
    offRouteM: best.bestDist,
    progressM: best.bestProgress,
    lat: best.bestLat,
    lon: best.bestLon,
  };
}

export function nextTurn(turns: Turn[], progressM: number): Turn | null {
  for (const turn of turns) {
    if (turn.at > progressM + 5) return turn;
  }
  return null;
}

/** Default lookahead distance for `findProximityAlert` — far enough to give a rider a few seconds' notice at cycling speed, close enough not to fire miles early. */
export const PROXIMITY_ALERT_RADIUS_M = 150;

/**
 * The nearest not-yet-alerted note within `radiusM` ahead of the rider's
 * current progress, or `null` if there isn't one. Built on the same live
 * position stream navigation already uses (`snap.progressM`) rather than a
 * separate background-geolocation plugin — proximity alerts are only
 * meaningful while navigation is actively running (tab open, wake lock
 * holding the screen on), so there's no case here that needs tracking to
 * continue once the rider backgrounds the app.
 *
 * A small negative slack (-20m) is allowed so a note doesn't get skipped by
 * GPS/snap jitter landing a couple of meters past it before the alert fires.
 */
export function findProximityAlert<T extends { id: string; distanceM: number }>(
  notes: readonly T[],
  progressM: number,
  alerted: ReadonlySet<string>,
  radiusM = PROXIMITY_ALERT_RADIUS_M,
): T | null {
  let best: T | null = null;
  let bestAhead = Infinity;
  for (const note of notes) {
    if (alerted.has(note.id)) continue;
    const ahead = note.distanceM - progressM;
    if (ahead < -20 || ahead > radiusM) continue;
    if (ahead < bestAhead) {
      best = note;
      bestAhead = ahead;
    }
  }
  return best;
}

export function turnLabel(direction: TurnDirection): string {
  switch (direction) {
    case "left":
      return "Turn left";
    case "right":
      return "Turn right";
    case "sharp-left":
      return "Sharp left";
    case "sharp-right":
      return "Sharp right";
  }
}

/** Elevation still to climb from the current index onwards. */
export function remainingAscent(points: RidePoint[], fromIndex: number): number {
  let ascent = 0;
  for (let i = Math.max(1, fromIndex); i < points.length; i++) {
    const delta = points[i].ele - points[i - 1].ele;
    if (delta > 0.5) ascent += delta;
  }
  return ascent;
}

/** Average grade over the next `spanM` meters, in percent. */
export function upcomingGrade(points: RidePoint[], fromIndex: number, spanM = 200): number {
  const start = points[fromIndex];
  if (!start) return 0;
  let end = start;
  for (let i = fromIndex; i < points.length; i++) {
    end = points[i];
    if (points[i].d - start.d >= spanM) break;
  }
  const run = end.d - start.d;
  if (run < 20) return 0;
  return ((end.ele - start.ele) / run) * 100;
}

/** Compass label ("north-east", "south", …) for a bearing in degrees. */
export function compassLabel(deg: number): string {
  const labels = [
    "north",
    "north-east",
    "east",
    "south-east",
    "south",
    "south-west",
    "west",
    "north-west",
  ];
  const index = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return labels[index];
}

/**
 * Direction of travel along the route at a given index, sampled over `span`
 * meters for stability (more reliable than live GPS heading, which is often
 * null or jittery at cycling speeds). Looks backwards near the end of the
 * route, and returns null if the route is too short or entirely gapped off.
 */
export function routeBearing(points: RidePoint[], index: number, span = 30): number | null {
  if (points.length < 2) return null;
  const i = Math.min(Math.max(index, 0), points.length - 1);

  let fwd = i;
  const fwdTarget = points[i].d + span;
  while (fwd < points.length - 1 && points[fwd].d < fwdTarget && !points[fwd + 1].gap) fwd++;
  if (fwd !== i) return bearing(points[i].lat, points[i].lon, points[fwd].lat, points[fwd].lon);

  let back = i;
  const backTarget = points[i].d - span;
  while (back > 0 && points[back].d > backTarget && !points[back].gap) back--;
  if (back !== i) return bearing(points[back].lat, points[back].lon, points[i].lat, points[i].lon);

  return null;
}

export type WindEffect = "headwind" | "tailwind" | "crosswind";

/**
 * Signed angle from the direction of travel to where the wind is blowing
 * from: 0 = wind straight ahead (headwind), ±180 = wind straight behind
 * (tailwind), ±90 = crosswind.
 */
export function windRelativeAngle(travelBearingDeg: number, windFromDeg: number): number {
  return bearingDelta(travelBearingDeg, windFromDeg);
}

/**
 * Classifies wind relative to the direction of travel from the signed angle
 * between them (0 = wind blowing straight into the rider, ±180 = straight
 * from behind).
 */
export function windEffect(relativeAngleDeg: number): WindEffect {
  const abs = Math.abs(relativeAngleDeg);
  if (abs <= 45) return "headwind";
  if (abs >= 135) return "tailwind";
  return "crosswind";
}

/**
 * Component of wind speed along the direction of travel: positive slows the
 * rider down (headwind), negative helps them along (tailwind).
 */
export function windComponent(windSpeedMs: number, relativeAngleDeg: number): number {
  return windSpeedMs * Math.cos((relativeAngleDeg * Math.PI) / 180);
}
