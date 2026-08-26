/**
 * Cue sheets: a full turn-by-turn instruction list for a route, built either
 * from real router step data (OSRM's `steps=true` response, captured by
 * `fetchOsrmRoute` in routing.ts and stored on the ride) or, when none was
 * captured — an imported GPX with no router history, or a route drawn from
 * BRouter geometry alone — derived on the fly from `detectTurns` so there's
 * always something to show, just without street names.
 */
import type { RidePoint } from "./gpx";
import { detectTurns } from "./nav";

export type CueDirection =
  | "depart"
  | "arrive"
  | "left"
  | "right"
  | "sharp-left"
  | "sharp-right"
  | "slight-left"
  | "slight-right"
  | "straight"
  | "uturn"
  | "roundabout"
  | "merge"
  | "fork"
  | "other";

/** One instruction a router (or turn detection) produced, as stored on a ride. */
export type RideCue = {
  /** cumulative route distance in meters where this instruction applies */
  atM: number;
  direction: CueDirection;
  /** street/way name from the router, when it provided one */
  name: string | null;
};

/** A cue with the distance from the previous entry filled in — what the UI renders. */
export type CueSheetEntry = RideCue & {
  /** distance in meters from the previous entry to this one */
  legM: number;
  text: string;
};

/** Maps an OSRM `maneuver.type`/`maneuver.modifier` pair to our direction enum. */
export function osrmDirection(type: string, modifier?: string | null): CueDirection {
  if (type === "depart") return "depart";
  if (type === "arrive") return "arrive";
  if (["roundabout", "rotary", "roundabout turn", "exit roundabout", "exit rotary"].includes(type))
    return "roundabout";
  if (type === "merge") return "merge";
  if (type === "fork") return "fork";
  switch (modifier) {
    case "left":
      return "left";
    case "right":
      return "right";
    case "sharp left":
      return "sharp-left";
    case "sharp right":
      return "sharp-right";
    case "slight left":
      return "slight-left";
    case "slight right":
      return "slight-right";
    case "straight":
      return "straight";
    case "uturn":
      return "uturn";
    default:
      return "other";
  }
}

/** Human-readable instruction text for a direction + optional street name. */
export function cueText(direction: CueDirection, name: string | null): string {
  const trimmedName = name?.trim() || null;
  const onto = trimmedName ? ` onto ${trimmedName}` : "";
  switch (direction) {
    case "depart":
      return trimmedName ? `Head out on ${trimmedName}` : "Start";
    case "arrive":
      return "Arrive at destination";
    case "roundabout":
      return `Take the roundabout${onto}`;
    case "merge":
      return `Merge${onto}`;
    case "fork":
      return `Keep at the fork${onto}`;
    case "straight":
      return `Continue straight${onto}`;
    case "uturn":
      return `Make a U-turn${onto}`;
    case "left":
      return `Turn left${onto}`;
    case "right":
      return `Turn right${onto}`;
    case "sharp-left":
      return `Sharp left${onto}`;
    case "sharp-right":
      return `Sharp right${onto}`;
    case "slight-left":
      return `Slight left${onto}`;
    case "slight-right":
      return `Slight right${onto}`;
    default:
      return trimmedName ? `Continue${onto}` : "Continue";
  }
}

const TURN_DIRECTION_TO_CUE: Record<string, CueDirection> = {
  left: "left",
  right: "right",
  "sharp-left": "sharp-left",
  "sharp-right": "sharp-right",
};

/** Fallback cue source when no router provided step data: geometry-only turns, no street names. */
function cuesFromDetectedTurns(points: RidePoint[]): RideCue[] {
  return detectTurns(points).map((turn) => ({
    atM: turn.at,
    direction: TURN_DIRECTION_TO_CUE[turn.direction] ?? "other",
    name: null,
  }));
}

/**
 * Builds the full, orderable instruction list for a route: a synthetic
 * "Start" entry, every real or detected turn strictly between the endpoints,
 * and a synthetic "Arrive" entry — each with the distance from the previous
 * entry (`legM`) and display text filled in.
 */
export function buildCueSheet(points: RidePoint[], storedCues: RideCue[] = []): CueSheetEntry[] {
  if (points.length < 2) return [];
  const totalM = points[points.length - 1].d;
  const middle = (storedCues.length > 0 ? storedCues : cuesFromDetectedTurns(points))
    .filter((cue) => cue.atM > 5 && cue.atM < totalM - 5)
    .sort((a, b) => a.atM - b.atM);

  const all: RideCue[] = [
    { atM: 0, direction: "depart", name: null },
    ...middle,
    { atM: totalM, direction: "arrive", name: null },
  ];

  return all.map((cue, i) => ({
    ...cue,
    legM: i === 0 ? 0 : Math.max(0, cue.atM - all[i - 1].atM),
    text: i === 0 && cue.direction === "depart" ? "Start" : cueText(cue.direction, cue.name),
  }));
}

/** Whether a ride has real router-provided cues (street names) rather than only geometry-detected turns. */
export function hasRouterCues(cues: RideCue[] | null | undefined): boolean {
  return Boolean(cues && cues.length > 0);
}

/**
 * The name of the cue sheet entry closest to `atM`, within `toleranceM` —
 * used to enrich a live turn-by-turn detection (which only knows geometry,
 * not street names) with a name from the router-provided cue sheet when one
 * is close enough to plausibly be the same turn. Returns null both when
 * nothing is close enough and when the closest entry has no name.
 */
export function nearestCueName(
  entries: CueSheetEntry[],
  atM: number,
  toleranceM = 25,
): string | null {
  let best: CueSheetEntry | null = null;
  let bestDist = Infinity;
  for (const entry of entries) {
    const dist = Math.abs(entry.atM - atM);
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best && bestDist <= toleranceM ? best.name : null;
}
