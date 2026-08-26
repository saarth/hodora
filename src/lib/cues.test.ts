import { describe, expect, it } from "vitest";
import { haversine, type RidePoint } from "./gpx";
import { buildCueSheet, cueText, osrmDirection, type RideCue } from "./cues";

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

/** A right-angle route: 200m north, then 200m east — one clear ~90° turn. */
function buildLShapedRoute(): RidePoint[] {
  const coords = [
    { eastM: 0, northM: 0 },
    { eastM: 0, northM: 100 },
    { eastM: 0, northM: 200 },
    { eastM: 100, northM: 200 },
    { eastM: 200, northM: 200 },
  ];
  let d = 0;
  return coords.map((c, i) => {
    const { lat, lon } = offset(c.eastM, c.northM);
    if (i > 0) {
      const prev = offset(coords[i - 1].eastM, coords[i - 1].northM);
      d += haversine(prev.lat, prev.lon, lat, lon);
    }
    return { lat, lon, ele: 0, d };
  });
}

describe("osrmDirection", () => {
  it("maps depart/arrive regardless of modifier", () => {
    expect(osrmDirection("depart")).toBe("depart");
    expect(osrmDirection("arrive")).toBe("arrive");
  });

  it("maps roundabout variants", () => {
    expect(osrmDirection("roundabout")).toBe("roundabout");
    expect(osrmDirection("exit roundabout")).toBe("roundabout");
    expect(osrmDirection("rotary")).toBe("roundabout");
  });

  it("falls back to the modifier for a plain turn", () => {
    expect(osrmDirection("turn", "left")).toBe("left");
    expect(osrmDirection("turn", "sharp right")).toBe("sharp-right");
    expect(osrmDirection("turn", "slight left")).toBe("slight-left");
    expect(osrmDirection("continue", "straight")).toBe("straight");
    expect(osrmDirection("turn", "uturn")).toBe("uturn");
  });

  it("falls back to 'other' when nothing matches", () => {
    expect(osrmDirection("notification")).toBe("other");
  });
});

describe("cueText", () => {
  it("includes the street name when present", () => {
    expect(cueText("left", "Main Street")).toBe("Turn left onto Main Street");
    expect(cueText("right", null)).toBe("Turn right");
  });

  it("has a distinct arrive/depart phrasing", () => {
    expect(cueText("arrive", null)).toBe("Arrive at destination");
    expect(cueText("depart", "Elm Ave")).toBe("Head out on Elm Ave");
  });
});

describe("buildCueSheet", () => {
  it("returns an empty sheet for fewer than two points", () => {
    expect(buildCueSheet([])).toEqual([]);
    expect(buildCueSheet([{ lat: 0, lon: 0, ele: 0, d: 0 }])).toEqual([]);
  });

  it("always starts with Start and ends with Arrive, legs summing to the total distance", () => {
    const points = buildLShapedRoute();
    const sheet = buildCueSheet(points);

    expect(sheet[0].text).toBe("Start");
    expect(sheet[0].legM).toBe(0);
    expect(sheet[sheet.length - 1].text).toBe("Arrive at destination");

    const totalLegs = sheet.reduce((sum, entry) => sum + entry.legM, 0);
    expect(totalLegs).toBeCloseTo(points[points.length - 1].d, 0);
  });

  it("falls back to a detected turn with no street name when no router cues were stored", () => {
    const points = buildLShapedRoute();
    const sheet = buildCueSheet(points, []);
    const turn = sheet.find((entry) => entry.direction === "right" || entry.direction === "left");
    expect(turn).toBeDefined();
    expect(turn?.name).toBeNull();
  });

  it("prefers stored router cues (with street names) over detected turns", () => {
    const points = buildLShapedRoute();
    const stored: RideCue[] = [{ atM: 200, direction: "right", name: "Elm Street" }];
    const sheet = buildCueSheet(points, stored);
    const named = sheet.find((entry) => entry.name === "Elm Street");
    expect(named).toBeDefined();
    expect(named?.text).toBe("Turn right onto Elm Street");
  });
});
