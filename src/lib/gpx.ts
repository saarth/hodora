export type RidePoint = {
  /** latitude */
  lat: number;
  /** longitude */
  lon: number;
  /** elevation in meters */
  ele: number;
  /** cumulative distance from the start in meters */
  d: number;
  /** true if this point starts a new `<trkseg>` — a real gap precedes it (e.g. a ferry crossing removed from the recording) */
  gap?: boolean;
};

/** Splits points into contiguous runs, breaking wherever a point has `gap: true`. */
export function splitBySegments(points: RidePoint[]): RidePoint[][] {
  const segments: RidePoint[][] = [];
  let current: RidePoint[] = [];
  for (const p of points) {
    if (p.gap && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push(p);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

export type ParsedRide = {
  name: string;
  points: RidePoint[];
  distanceM: number;
  ascentM: number;
  descentM: number;
  bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number };
};

const EARTH_RADIUS_M = 6371008.8;

export function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

/** Great-circle distance in meters between two coordinates. */
export function haversine(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing in degrees (0-360) from a to b. */
export function bearing(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const dLon = toRad(bLon - aLon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Signed smallest angle between two bearings, positive = right turn. */
export function bearingDelta(from: number, to: number): number {
  let delta = ((to - from + 540) % 360) - 180;
  if (Object.is(delta, -180)) delta = 180;
  return delta;
}

function smoothElevation(values: number[]): number[] {
  if (values.length < 5) return values;
  const out = new Array<number>(values.length);
  const window = 2;
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - window; j <= i + window; j++) {
      if (j < 0 || j >= values.length) continue;
      sum += values[j];
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

/** Perpendicular distance in meters from `p` to the (infinite) line through `a` and `b`. */
function perpendicularDistanceM(p: RidePoint, a: RidePoint, b: RidePoint): number {
  const cosLat = Math.cos(toRad(a.lat));
  const toXY = (lat: number, lon: number) => ({
    x: toRad(lon - a.lon) * EARTH_RADIUS_M * cosLat,
    y: toRad(lat - a.lat) * EARTH_RADIUS_M,
  });
  const b2 = toXY(b.lat, b.lon);
  const p2 = toXY(p.lat, p.lon);
  const lenSq = b2.x * b2.x + b2.y * b2.y;
  if (lenSq === 0) return Math.hypot(p2.x, p2.y);
  const t = (p2.x * b2.x + p2.y * b2.y) / lenSq;
  return Math.hypot(p2.x - t * b2.x, p2.y - t * b2.y);
}

/**
 * Ramer-Douglas-Peucker: keeps the points that best preserve the route's
 * shape (corners, turns) and drops the ones that fall within `epsilonM` of
 * the straight line between their neighbors, instead of dropping points by
 * uniform index sampling (which can shave off real corners).
 */
function simplifyRDP(points: RidePoint[], epsilonM: number): RidePoint[] {
  if (points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end <= start + 1) continue;
    const a = points[start];
    const b = points[end];
    let maxDist = -1;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i++) {
      const dist = perpendicularDistanceM(points[i], a, b);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }
    if (maxDist > epsilonM) {
      keep[maxIndex] = true;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/**
 * Keep files light: simplify with RDP, binary-searching the epsilon so the
 * result stays under `maxPoints` while preserving turn geometry. Runs each
 * `<trkseg>` independently so a real gap between segments never gets
 * smoothed away or bridged by the simplification.
 */
function simplify(points: RidePoint[], maxPoints = 2500): RidePoint[] {
  if (points.length <= maxPoints) return points;
  const segments = splitBySegments(points);
  const simplifyAt = (epsilonM: number) => segments.flatMap((seg) => simplifyRDP(seg, epsilonM));

  let lo = 0;
  let hi = 200;
  let result = simplifyAt(hi);
  while (result.length > maxPoints && hi < 100_000) {
    hi *= 2;
    result = simplifyAt(hi);
  }

  for (let i = 0; i < 25 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    const candidate = simplifyAt(mid);
    if (candidate.length > maxPoints) {
      lo = mid;
    } else {
      hi = mid;
      result = candidate;
    }
  }

  return result;
}

export function parseGpx(xml: string, fallbackName: string): ParsedRide {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("That file isn't valid GPX.");
  }

  // Group by <trkseg> (falling back to a single implicit segment for <rtept>
  // routes or tracks with no <trkseg> wrapper) so a real break between
  // segments — e.g. a ferry crossing removed from the recording — can be
  // rendered as a gap instead of a straight line across it.
  const trksegs = Array.from(doc.getElementsByTagName("trkseg"));
  let nodesWithSeg: { node: Element; segIndex: number }[];
  if (trksegs.length > 0) {
    nodesWithSeg = trksegs.flatMap((seg, segIndex) =>
      Array.from(seg.getElementsByTagName("trkpt")).map((node) => ({ node, segIndex })),
    );
  } else {
    const trkpts = Array.from(doc.getElementsByTagName("trkpt"));
    const flat = trkpts.length > 0 ? trkpts : Array.from(doc.getElementsByTagName("rtept"));
    nodesWithSeg = flat.map((node) => ({ node, segIndex: 0 }));
  }

  if (nodesWithSeg.length < 2) {
    throw new Error("No track points found in this GPX file.");
  }

  const raw: { lat: number; lon: number; ele: number; gap: boolean }[] = [];
  let prevSeg = -1;
  for (const { node, segIndex } of nodesWithSeg) {
    const lat = Number(node.getAttribute("lat"));
    const lon = Number(node.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleText = node.getElementsByTagName("ele")[0]?.textContent;
    const ele = eleText ? Number(eleText) : 0;
    raw.push({
      lat,
      lon,
      ele: Number.isFinite(ele) ? ele : 0,
      gap: raw.length > 0 && segIndex !== prevSeg,
    });
    prevSeg = segIndex;
  }
  if (raw.length < 2) {
    throw new Error("No usable coordinates found in this GPX file.");
  }

  const smoothed = smoothElevation(raw.map((p) => p.ele));

  let distance = 0;
  let ascent = 0;
  let descent = 0;
  let minLat = raw[0].lat;
  let maxLat = raw[0].lat;
  let minLon = raw[0].lon;
  let maxLon = raw[0].lon;

  const points: RidePoint[] = raw.map((p, i) => {
    if (i > 0) {
      const prev = raw[i - 1];
      distance += haversine(prev.lat, prev.lon, p.lat, p.lon);
      const dEle = smoothed[i] - smoothed[i - 1];
      if (dEle > 0.5) ascent += dEle;
      else if (dEle < -0.5) descent += -dEle;
    }
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
    return {
      lat: p.lat,
      lon: p.lon,
      ele: Math.round(smoothed[i] * 10) / 10,
      d: Math.round(distance),
      ...(p.gap ? { gap: true as const } : {}),
    };
  });

  const nameFromFile =
    doc.getElementsByTagName("name")[0]?.textContent?.trim() || fallbackName;

  return {
    name: nameFromFile.slice(0, 120),
    points: simplify(points),
    distanceM: distance,
    ascentM: ascent,
    descentM: descent,
    bounds: { minLat, minLon, maxLat, maxLon },
  };
}

export function formatDistance(meters: number, metric = true): string {
  if (metric) {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1)} km`;
  }
  const miles = meters / 1609.344;
  if (miles < 0.2) return `${Math.round(meters * 3.28084)} ft`;
  return `${miles.toFixed(miles < 10 ? 2 : 1)} mi`;
}

export function formatElevation(meters: number, metric = true): string {
  return metric
    ? `${Math.round(meters)} m`
    : `${Math.round(meters * 3.28084)} ft`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m} min`;
}

export function formatSpeed(mps: number, metric = true): string {
  if (!Number.isFinite(mps) || mps <= 0) return "0.0";
  return (mps * (metric ? 3.6 : 2.236936)).toFixed(1);
}
