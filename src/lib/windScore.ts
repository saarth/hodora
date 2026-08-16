/**
 * Route-level wind analysis: chunks a GPX track into short segments, classifies
 * each against a single wind sample (current conditions or one hourly forecast
 * slot), and aggregates the result into the tailwind/headwind/crosswind mix and
 * a 0-100 "wind score" shown in the planner UI and the public share page.
 *
 * Built entirely on the existing per-instant primitives in nav.ts/gpx.ts — this
 * module only adds chunking + aggregation on top of them.
 */
import type { RidePoint } from "./gpx";
import { routeBearing, windComponent, windEffect, windRelativeAngle, type WindEffect } from "./nav";

export type WindSample = {
  /** wind speed in m/s */
  windSpeedMs: number;
  /** degrees the wind is blowing FROM, meteorological convention */
  windDirectionDeg: number;
};

export type WindSegment = {
  startIndex: number;
  endIndex: number;
  /** segment length in meters */
  lengthM: number;
  effect: WindEffect;
  /** signed angle from direction of travel to where the wind blows from */
  relativeAngleDeg: number;
  /** wind speed component along the direction of travel: positive = headwind */
  componentMs: number;
};

export type WindScoreResult = {
  /** 0-100, 50 = calm/neutral, 100 = strong net tailwind, 0 = strong net headwind */
  windScore: number;
  tailwindPct: number;
  headwindPct: number;
  crosswindPct: number;
  /** distance-weighted along-route wind component; positive = net headwind */
  meanComponentMs: number;
  /** distance-weighted lateral wind component magnitude */
  meanCrosswindMs: number;
  avgWindSpeedMs: number;
};

/** Reference wind speed (m/s) at which a pure tailwind/headwind saturates the score. */
export const WIND_SCORE_REF_MS = 8;

/** Default chunk length used to group route points before scoring each stretch. */
export const WIND_SEGMENT_CHUNK_M = 50;

/**
 * Groups the route into chunks of roughly `chunkMeters`, breaking early at a
 * `gap` boundary so a segment never bridges a real break in the recording
 * (e.g. a ferry crossing). Each chunk's direction of travel comes from
 * `routeBearing` sampled at its midpoint.
 */
export function buildWindSegments(
  points: RidePoint[],
  wind: WindSample,
  chunkMeters = WIND_SEGMENT_CHUNK_M,
): WindSegment[] {
  if (points.length < 2) return [];
  const segments: WindSegment[] = [];
  let chunkStart = 0;

  for (let i = 1; i < points.length; i++) {
    const atGap = Boolean(points[i].gap);
    const isLast = i === points.length - 1;
    const lengthM = points[i].d - points[chunkStart].d;
    if (!atGap && !isLast && lengthM < chunkMeters) continue;

    if (lengthM > 0) {
      const midIndex = Math.round((chunkStart + i) / 2);
      const travelBearing = routeBearing(points, midIndex);
      if (travelBearing !== null) {
        const relativeAngleDeg = windRelativeAngle(travelBearing, wind.windDirectionDeg);
        segments.push({
          startIndex: chunkStart,
          endIndex: i,
          lengthM,
          effect: windEffect(relativeAngleDeg),
          relativeAngleDeg,
          componentMs: windComponent(wind.windSpeedMs, relativeAngleDeg),
        });
      }
    }
    chunkStart = i;
  }

  return segments;
}

/**
 * Aggregates a route's wind segments into the tailwind/headwind/crosswind mix
 * and an overall wind score. Returns null for a route too short to segment
 * (e.g. a single point).
 */
export function scoreRoute(points: RidePoint[], wind: WindSample): WindScoreResult | null {
  const segments = buildWindSegments(points, wind);
  const totalLengthM = segments.reduce((sum, segment) => sum + segment.lengthM, 0);
  if (totalLengthM <= 0) return null;

  let tailwindM = 0;
  let headwindM = 0;
  let crosswindM = 0;
  let weightedComponent = 0;
  let weightedCrosswind = 0;

  for (const segment of segments) {
    if (segment.effect === "tailwind") tailwindM += segment.lengthM;
    else if (segment.effect === "headwind") headwindM += segment.lengthM;
    else crosswindM += segment.lengthM;

    weightedComponent += segment.componentMs * segment.lengthM;
    const lateralMs = wind.windSpeedMs * Math.sin((segment.relativeAngleDeg * Math.PI) / 180);
    weightedCrosswind += Math.abs(lateralMs) * segment.lengthM;
  }

  const meanComponentMs = weightedComponent / totalLengthM;
  const windScore = Math.round(
    Math.min(100, Math.max(0, 50 - (meanComponentMs / WIND_SCORE_REF_MS) * 50)),
  );

  return {
    windScore,
    tailwindPct: Math.round((tailwindM / totalLengthM) * 100),
    headwindPct: Math.round((headwindM / totalLengthM) * 100),
    crosswindPct: Math.round((crosswindM / totalLengthM) * 100),
    meanComponentMs,
    meanCrosswindMs: weightedCrosswind / totalLengthM,
    avgWindSpeedMs: wind.windSpeedMs,
  };
}

/**
 * Turns a route's wind segments into a GeoJSON FeatureCollection of small
 * LineStrings, each carrying `properties.effect` — the shape RouteMap needs
 * for a data-driven per-segment line-color paint expression.
 */
export function windSegmentsToGeoJSON(points: RidePoint[], segments: WindSegment[]) {
  return {
    type: "FeatureCollection" as const,
    features: segments.map((segment) => ({
      type: "Feature" as const,
      properties: { effect: segment.effect },
      geometry: {
        type: "LineString" as const,
        coordinates: points
          .slice(segment.startIndex, segment.endIndex + 1)
          .map((p) => [p.lon, p.lat]),
      },
    })),
  };
}

/**
 * Rotation (degrees, 0-360) for an arrow icon that should point where the
 * wind is blowing TOWARD, given the meteorological "blowing FROM" direction
 * — i.e. the reverse bearing.
 */
export function windArrowRotation(windFromDeg: number): number {
  return (((windFromDeg + 180) % 360) + 360) % 360;
}
