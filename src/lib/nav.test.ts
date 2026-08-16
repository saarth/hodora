import { describe, expect, it } from "vitest";
import { haversine, type RidePoint } from "./gpx";
import {
  compassLabel,
  detectTurns,
  nextTurn,
  remainingAscent,
  routeBearing,
  snapToRoute,
  turnLabel,
  upcomingGrade,
  windComponent,
  windEffect,
  windRelativeAngle,
} from "./nav";

const BASE_LAT = 45;
const BASE_LON = -122;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((BASE_LAT * Math.PI) / 180);

function offset(eastM: number, northM: number) {
  return {
    lat: BASE_LAT + northM / M_PER_DEG_LAT,
    lon: BASE_LON + eastM / M_PER_DEG_LON,
  };
}

/** Builds RidePoints with real cumulative distance, so detectTurns/snapToRoute see realistic `.d` values. */
function buildPoints(coords: { eastM: number; northM: number; gap?: boolean }[]): RidePoint[] {
  let d = 0;
  return coords.map((c, i) => {
    const { lat, lon } = offset(c.eastM, c.northM);
    if (i > 0) {
      const prev = offset(coords[i - 1].eastM, coords[i - 1].northM);
      d += haversine(prev.lat, prev.lon, lat, lon);
    }
    return { lat, lon, ele: 0, d, ...(c.gap ? { gap: true as const } : {}) };
  });
}

/** A straight ~100m east leg followed by a 90° corner into a ~100m north leg, sampled every 10m. */
function cornerRoute(gapAtCorner: boolean): RidePoint[] {
  const coords: { eastM: number; northM: number; gap?: boolean }[] = [];
  for (let e = -100; e <= 0; e += 10) coords.push({ eastM: e, northM: 0 });
  for (let n = 10; n <= 100; n += 10) {
    coords.push({ eastM: 0, northM: n, gap: gapAtCorner && n === 10 });
  }
  return buildPoints(coords);
}

describe("detectTurns", () => {
  it("detects a left turn at a 90 degree corner", () => {
    const points = cornerRoute(false);
    const turns = detectTurns(points);
    expect(turns.length).toBeGreaterThan(0);
    const cornerD = points[10].d;
    const nearCorner = turns.find((t) => Math.abs(t.at - cornerD) < 30);
    expect(nearCorner).toBeDefined();
    expect(nearCorner!.direction).toBe("left");
  });

  it("does not fabricate a turn across a <trkseg> gap at the same corner", () => {
    const points = cornerRoute(true);
    const turns = detectTurns(points);
    const cornerD = points[10].d;
    const nearCorner = turns.find((t) => Math.abs(t.at - cornerD) < 30);
    expect(nearCorner).toBeUndefined();
  });
});

describe("snapToRoute", () => {
  it("projects a live position onto the nearest segment and reports off-route distance + progress", () => {
    const coords = [];
    for (let e = 0; e <= 100; e += 10) coords.push({ eastM: e, northM: 0 });
    const points = buildPoints(coords);

    const live = offset(50, 15);
    const snap = snapToRoute(points, live.lat, live.lon);

    expect(snap.offRouteM).toBeGreaterThan(12);
    expect(snap.offRouteM).toBeLessThan(18);
    expect(snap.progressM).toBeGreaterThan(47);
    expect(snap.progressM).toBeLessThan(53);
  });

  it("handles a single-point route without throwing", () => {
    const points = buildPoints([{ eastM: 0, northM: 0 }]);
    const live = offset(5, 5);
    const snap = snapToRoute(points, live.lat, live.lon);
    expect(snap.index).toBe(0);
    expect(snap.offRouteM).toBeGreaterThan(0);
  });

  it("stays near the last known index instead of jumping back to a spatially-close-but-far-in-progress point on a loop", () => {
    // A large loop whose start and finish sit right next to each other (a
    // rider closing the lap). With no continuity, a fix near the finish is
    // just as close to the *start* of the loop as to the finish, and a plain
    // global nearest-point search can snap to progress ~0 instead of ~total
    // — the bug that let a loop's "ride finished" detection never fire
    // (src/routes/rides.$id.nav.tsx passes the previous snap's index in as
    // `lastIndex` specifically to prevent this).
    const coords: { eastM: number; northM: number }[] = [];
    const n = 300;
    const radius = 200;
    for (let i = 0; i < n; i++) {
      const angle = (i / (n - 1)) * 2 * Math.PI;
      coords.push({ eastM: radius * Math.sin(angle), northM: radius * (1 - Math.cos(angle)) });
    }
    const points = buildPoints(coords);
    const totalDistance = points[points.length - 1].d;

    // The rider is essentially back at the shared start/finish coordinate.
    const live = offset(coords[n - 1].eastM, coords[n - 1].northM);

    // Naive global search (no continuity) resolves to the start of the loop.
    const cold = snapToRoute(points, live.lat, live.lon);
    expect(cold.progressM).toBeLessThan(totalDistance * 0.1);

    // Continuity-aware search, seeded with the previous fix's index near the
    // finish, correctly resolves to the finish instead.
    const warm = snapToRoute(points, live.lat, live.lon, n - 10);
    expect(warm.progressM).toBeGreaterThan(totalDistance * 0.9);
  });
});

describe("nextTurn / turnLabel / compassLabel", () => {
  it("returns the first turn beyond the current progress", () => {
    const turns = [
      { index: 1, at: 100, direction: "left" as const, angle: -90 },
      { index: 2, at: 200, direction: "right" as const, angle: 90 },
    ];
    expect(nextTurn(turns, 50)?.at).toBe(100);
    expect(nextTurn(turns, 150)?.at).toBe(200);
    expect(nextTurn(turns, 250)).toBeNull();
  });

  it("labels turn directions", () => {
    expect(turnLabel("left")).toBe("Turn left");
    expect(turnLabel("sharp-right")).toBe("Sharp right");
  });

  it("labels compass directions", () => {
    expect(compassLabel(0)).toBe("north");
    expect(compassLabel(90)).toBe("east");
    expect(compassLabel(180)).toBe("south");
  });
});

describe("routeBearing", () => {
  it("points along the direction of travel on a straight leg", () => {
    const coords = [];
    for (let e = 0; e <= 100; e += 10) coords.push({ eastM: e, northM: 0 });
    const points = buildPoints(coords);
    expect(routeBearing(points, 2)).toBeCloseTo(90, 0); // due east
  });

  it("looks backwards near the end of the route", () => {
    const coords = [];
    for (let e = 0; e <= 100; e += 10) coords.push({ eastM: e, northM: 0 });
    const points = buildPoints(coords);
    expect(routeBearing(points, points.length - 1)).toBeCloseTo(90, 0);
  });

  it("returns null when a gap blocks both directions", () => {
    const points = buildPoints([
      { eastM: 0, northM: 0 },
      { eastM: 0, northM: 5, gap: true },
    ]);
    expect(routeBearing(points, 0, 30)).toBeNull();
  });
});

describe("remainingAscent", () => {
  const points: RidePoint[] = [
    { lat: 0, lon: 0, ele: 0, d: 0 },
    { lat: 0, lon: 0, ele: 10, d: 100 }, // +10 climb
    { lat: 0, lon: 0, ele: 5, d: 200 }, // -5 descent, ignored
    { lat: 0, lon: 0, ele: 20, d: 300 }, // +15 climb
  ];

  it("sums only upward elevation deltas above the noise threshold from the start", () => {
    expect(remainingAscent(points, 0)).toBe(25);
  });

  it("only counts climbing from the given index onwards", () => {
    expect(remainingAscent(points, 2)).toBe(15);
  });

  it("ignores climbs of 0.5m or less as GPS noise", () => {
    const noisy: RidePoint[] = [
      { lat: 0, lon: 0, ele: 0, d: 0 },
      { lat: 0, lon: 0, ele: 0.3, d: 10 },
      { lat: 0, lon: 0, ele: 0.5, d: 20 },
    ];
    expect(remainingAscent(noisy, 0)).toBe(0);
  });
});

describe("upcomingGrade", () => {
  it("computes average percent grade over the requested span", () => {
    const points: RidePoint[] = [
      { lat: 0, lon: 0, ele: 0, d: 0 },
      { lat: 0, lon: 0, ele: 10, d: 100 },
      { lat: 0, lon: 0, ele: 20, d: 200 },
    ];
    expect(upcomingGrade(points, 0, 200)).toBeCloseTo(10, 5); // 20m climb / 200m run
  });

  it("returns a negative grade on a descent", () => {
    const points: RidePoint[] = [
      { lat: 0, lon: 0, ele: 20, d: 0 },
      { lat: 0, lon: 0, ele: 0, d: 100 },
    ];
    expect(upcomingGrade(points, 0, 100)).toBeCloseTo(-20, 5);
  });

  it("returns 0 when the remaining route is shorter than 20m (too little run to trust)", () => {
    const points: RidePoint[] = [
      { lat: 0, lon: 0, ele: 0, d: 0 },
      { lat: 0, lon: 0, ele: 5, d: 10 },
    ];
    expect(upcomingGrade(points, 0)).toBe(0);
  });

  it("returns 0 for an out-of-range index", () => {
    const points: RidePoint[] = [{ lat: 0, lon: 0, ele: 0, d: 0 }];
    expect(upcomingGrade(points, 5)).toBe(0);
  });
});

describe("wind helpers", () => {
  it("classifies wind blowing straight into the rider as a headwind", () => {
    const relative = windRelativeAngle(90, 90); // traveling east, wind from the east
    expect(relative).toBeCloseTo(0, 5);
    expect(windEffect(relative)).toBe("headwind");
    expect(windComponent(5, relative)).toBeCloseTo(5, 5);
  });

  it("classifies wind blowing from behind as a tailwind", () => {
    const relative = windRelativeAngle(90, 270); // traveling east, wind from the west
    expect(Math.abs(relative)).toBeCloseTo(180, 5);
    expect(windEffect(relative)).toBe("tailwind");
    expect(windComponent(5, relative)).toBeCloseTo(-5, 5);
  });

  it("classifies wind from the side as a crosswind", () => {
    const relative = windRelativeAngle(90, 0); // traveling east, wind from the north
    expect(windEffect(relative)).toBe("crosswind");
    expect(windComponent(5, relative)).toBeCloseTo(0, 5);
  });
});
