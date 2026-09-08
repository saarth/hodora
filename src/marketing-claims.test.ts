import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildParsedRide, computeAscentDescent, haversine, parseGpx } from "@/lib/gpx";
import type { RawTrackPoint, RidePoint } from "@/lib/gpx";
import { detectTurns, upcomingGrade } from "@/lib/nav";
import { geolocationOptions, weatherPollOptions } from "@/lib/low-power";
import { tileKeysForRoute } from "@/lib/offline-tiles";

/**
 * The public marketing pages (`/`, `/bike-navigation-app`, `/club-rides`,
 * `/gps-cycling-app`, `/turn-by-turn-navigation`, `/offline-navigation`,
 * `/bike-computer-alternative`, `/gpx-routes`, `/elevation-tracking`) don't
 * just describe the app in the abstract — they quote specific numbers and
 * behaviours, because that's what makes a page worth citing rather than
 * skimming. Copy like that rots silently: nothing breaks when a threshold
 * moves, the page just starts lying.
 *
 * This file is the tripwire. Every assertion protects a sentence that is
 * live on the site, and each test name says which page and which claim, so
 * a failure tells you what to go and reword rather than leaving you to
 * guess. If a claim here fails because the *code* changed deliberately,
 * the fix is to update the page copy and then this test — in that order.
 *
 * Behaviour is asserted through the real functions wherever it can be
 * reached, so ordinary refactoring doesn't trip it. The `source of truth`
 * block at the end is the exception: those facts (which router the planner
 * asks first, what the nav screen puts on screen) aren't reachable without
 * a network or a browser, so they're checked against the source text and
 * are the ones most likely to need a light touch after a refactor.
 */

const BASE_LAT = 45;
const BASE_LON = -122;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((BASE_LAT * Math.PI) / 180);

function at(eastM: number, northM: number, ele = 0) {
  return {
    lat: BASE_LAT + northM / M_PER_DEG_LAT,
    lon: BASE_LON + eastM / M_PER_DEG_LON,
    ele,
  };
}

/** Adds the cumulative `d` every RidePoint carries. */
function withDistance(points: { lat: number; lon: number; ele: number }[]): RidePoint[] {
  let d = 0;
  return points.map((p, i) => {
    if (i > 0) d += haversine(points[i - 1].lat, points[i - 1].lon, p.lat, p.lon);
    return { ...p, d };
  });
}

/**
 * Two straight legs meeting at a corner of `turnDeg`, sampled every 10 m —
 * dense enough for `detectTurns`, which compares the bearing 30 m either
 * side of each point.
 */
function corner(turnDeg: number, legM = 120): RidePoint[] {
  const step = 10;
  const points: { lat: number; lon: number; ele: number }[] = [];
  for (let m = legM; m > 0; m -= step) points.push(at(0, -m));
  points.push(at(0, 0));
  const rad = ((90 - turnDeg) * Math.PI) / 180;
  for (let m = step; m <= legM; m += step) {
    points.push(at(Math.cos(rad) * m, Math.sin(rad) * m));
  }
  return withDistance(points);
}

function raw(points: { lat: number; lon: number; ele: number }[]): RawTrackPoint[] {
  return points.map((p) => ({ ...p, gap: false }));
}

describe("/turn-by-turn-navigation — turns are detected from the route's own geometry", () => {
  it('"treats anything above about 35 degrees as a turn" — 25° is not a turn', () => {
    expect(detectTurns(corner(25))).toHaveLength(0);
  });

  it('"treats anything above about 35 degrees as a turn" — 45° is', () => {
    const turns = detectTurns(corner(45));
    expect(turns).toHaveLength(1);
    expect(turns[0].direction).toBe("right");
  });

  it('"a complete cue sheet from a file that contained no instructions"', () => {
    // No router, no step data, no street names — just coordinates.
    expect(detectTurns(corner(90)).length).toBeGreaterThan(0);
  });
});

describe("/elevation-tracking — how the climbing is measured", () => {
  /** Flat ground, ±0.6 m of alternating receiver jitter on every other point. */
  function jittery(count = 60) {
    return Array.from({ length: count }, (_, i) => at(0, i * 10, i % 2 === 0 ? 0 : 0.6));
  }

  it('"counts a rise only once it exceeds half a metre" — 0.4 m is ignored', () => {
    const flat = withDistance([at(0, 0, 100), at(0, 100, 100.4), at(0, 200, 100.8)]);
    expect(computeAscentDescent(flat).ascentM).toBe(0);
  });

  it('"counts a rise only once it exceeds half a metre" — 0.6 m counts', () => {
    const climb = withDistance([at(0, 0, 100), at(0, 100, 100.6)]);
    expect(computeAscentDescent(climb).ascentM).toBeCloseTo(0.6, 5);
  });

  it('"imported GPX files and rides you record both go through" the smoothing', () => {
    const smoothedAscent = buildParsedRide(raw(jittery()), "jittery").ascentM;
    // Without smoothing this sawtooth would accumulate ~0.6 m per pair.
    expect(smoothedAscent).toBeLessThan(5);
  });

  it('"routes built in the planner skip the smoothing" — the same jitter is counted', () => {
    const unsmoothedAscent = computeAscentDescent(withDistance(jittery())).ascentM;
    expect(unsmoothedAscent).toBeGreaterThan(15);
    // The contrast is the claim: same input, two pipelines, different totals.
    expect(unsmoothedAscent).toBeGreaterThan(buildParsedRide(raw(jittery()), "j").ascentM);
  });

  it('"the average gradient of the next 200 metres" — a 200 m climb reads full grade', () => {
    const climb = withDistance(
      Array.from({ length: 41 }, (_, i) => at(0, i * 10, i * 10 * 0.1)), // 10% for 400 m
    );
    expect(upcomingGrade(climb, 0)).toBeCloseTo(10, 0);
  });

  it('"the average gradient of the next 200 metres" — 100 m up then flat halves it', () => {
    const rampThenFlat = withDistance(
      Array.from({ length: 41 }, (_, i) => at(0, i * 10, Math.min(i * 10, 100) * 0.1)),
    );
    // Averaged over 200 m of road, not measured at a point.
    expect(upcomingGrade(rampThenFlat, 0)).toBeCloseTo(5, 0);
  });
});

describe("/gpx-routes — what a GPX file can contain", () => {
  it('"reads both GPX tracks and routes" — a <rtept>-only file parses', () => {
    const gpx =
      `<?xml version="1.0"?><gpx><rte><name>Club route</name>` +
      `<rtept lat="45" lon="-122"><ele>10</ele></rtept>` +
      `<rtept lat="45.001" lon="-122"><ele>20</ele></rtept>` +
      `</rte></gpx>`;
    const parsed = parseGpx(gpx, "fallback");
    expect(parsed.points.length).toBeGreaterThanOrEqual(2);
    expect(parsed.distanceM).toBeGreaterThan(0);
  });
});

describe("/offline-navigation — what saving a route offline downloads", () => {
  const route = withDistance(Array.from({ length: 200 }, (_, i) => at(i * 50, 0)));

  it('"at the handful of zoom levels you actually navigate at"', () => {
    const zooms = new Set(tileKeysForRoute(route).map((key) => key.split("/")[0]));
    expect([...zooms].sort()).toEqual(["11", "12", "13", "14"]);
  });

  it('"caps very long routes so one save cannot swallow your storage"', () => {
    const veryLong = withDistance(Array.from({ length: 20_000 }, (_, i) => at(i * 50, 0)));
    expect(tileKeysForRoute(veryLong).length).toBeLessThanOrEqual(1500);
  });
});

describe("/ and /bike-computer-alternative — what low-power mode actually trades", () => {
  it('"drops the GPS chip out of high-accuracy mode"', () => {
    expect(geolocationOptions(true).enableHighAccuracy).toBe(false);
    expect(geolocationOptions(false).enableHighAccuracy).toBe(true);
  });

  it('"and polls the weather less often"', () => {
    expect(weatherPollOptions(true).pollMs).toBeGreaterThan(weatherPollOptions(false).pollMs);
  });

  it("does not touch rendering — the copy must not claim it dims or redraws the map", () => {
    const lowPower = readFileSync(resolve(__dirname, "lib/low-power.ts"), "utf8");
    expect(lowPower).not.toMatch(/redraw|brightness|\bdim\b/i);
  });
});

/**
 * Facts the marketing copy states that can't be reached without a network
 * or a rendered browser, so they're pinned to the source instead. These are
 * the assertions most likely to need adjusting after an unrelated refactor
 * — if one fails, check whether the *claim* is still true before rewriting
 * the matcher.
 */
describe("source of truth for claims that can't be executed here", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

  it("/turn-by-turn-navigation: street names come from re-routing an *imported* track, not the planner", () => {
    // The planner asks BRouter first (for the bike profile and elevation),
    // and BRouter returns no step data — so planned routes get geometry
    // cues too. Only the imported-GPX recovery path goes via OSRM.
    expect(read("routes/plan.tsx")).toContain("preferBrouter: true");
    expect(read("lib/routing.ts")).toMatch(/fetchBrouterRoute[\s\S]{0,2500}?cues: \[\]/);
    expect(read("lib/cue-recovery.ts")).toContain("fetchOsrmRoute");
    expect(read("routes/rides.$id.index.tsx")).toMatch(
      /ride\.source_filename && !hasNamedCues[\s\S]{0,900}?Recover street names/,
    );
  });

  it("/turn-by-turn-navigation: the navigation screen shows the metrics the page lists", () => {
    const nav = read("routes/rides.$id.nav.tsx");
    for (const label of ["To go", "Climb left", "Grade", "Elapsed", "Speed", "ETA"]) {
      expect(nav).toContain(`label="${label}"`);
    }
    expect(nav).toContain("ElevationChart");
    expect(nav).toContain("buildCueSheet");
    expect(nav).toContain("useWakeLock");
  });

  it("/offline-navigation: saving a recorded ride needs the network when signed in", () => {
    const rides = read("lib/rides.ts");
    expect(rides).toMatch(/Guest: keep the route on the device only\.[\s\S]{0,400}?putOfflineRide/);
    expect(rides).toMatch(/supabase\s*\.from\("rides"\)\s*\.insert/);
    expect(rides.toLowerCase()).not.toContain("outbox");
  });

  it("/gps-cycling-app: recording is elapsed time with manual pause, not auto-paused moving time", () => {
    const record = read("routes/record.tsx");
    expect(record).toContain("pausedAccumMsRef");
    expect(record).not.toMatch(/autoPause|auto_pause/);
  });

  it("/gpx-routes: the library filters and surface tags the page names exist", () => {
    const list = read("routes/rides.index.tsx");
    for (const filter of ["difficultyFilter", "surfaceFilter", "offlineOnly", "recordedOnly"]) {
      expect(list).toContain(filter);
    }
    expect(read("lib/rides.ts")).toContain(
      'RideSurface = "paved" | "gravel" | "mixed" | "unpaved"',
    );
  });

  it("/gps-cycling-app: no analytics vendor is wired anywhere", () => {
    const vendor =
      /google-analytics\.com|googletagmanager|\bgtag\(|plausible\.io|posthog\.(com|init)|mixpanel\.|sentry\.io|Sentry\.init|bugsnag/i;
    const offenders = globSync("**/*.{ts,tsx}", { cwd: __dirname })
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      // error-reporting.ts names vendors in a doc comment showing how a
      // self-hoster could attach one; a comment is not a wired-up tracker.
      .filter((file) => {
        const body = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
        return vendor.test(body);
      });
    expect(offenders).toEqual([]);
  });

  it("/llms.txt: exists because the map routes are client-rendered", () => {
    // If either of these gains SSR, llms.txt's stated rationale is stale.
    expect(read("routes/plan.tsx")).toContain("ssr: false");
    expect(read("routes/explore.tsx")).toContain("ssr: false");
  });
});
