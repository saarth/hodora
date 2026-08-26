import { describe, expect, it } from "vitest";
import { parseGpx, toGpx, type RidePoint } from "@/lib/gpx";
import { parseGpxServer } from "./gpx-remote.server";

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

describe("parseGpxServer", () => {
  it("parses a multi-segment GPX file with the same result as the DOM-based parseGpx", () => {
    const points: RidePoint[] = [
      { ...offset(0, 0), ele: 10, d: 0 },
      { ...offset(50, 0), ele: 12, d: 50 },
      { ...offset(200, 0), ele: 9, d: 200, gap: true },
      { ...offset(250, 0), ele: 11, d: 250 },
    ];
    const xml = toGpx({ name: "Both Parsers", points });

    const viaDom = parseGpx(xml, "fallback");
    const viaServer = parseGpxServer(xml, "fallback");

    expect(viaServer.name).toBe(viaDom.name);
    expect(viaServer.points).toEqual(viaDom.points);
    expect(viaServer.distanceM).toBeCloseTo(viaDom.distanceM, 6);
    expect(viaServer.bounds).toEqual(viaDom.bounds);
  });

  it("falls back to rtept when there are no trkpt/trkseg elements", () => {
    const xml = `<?xml version="1.0"?><gpx><rte><name>Route</name><rtept lat="45.0" lon="-122.0"><ele>10</ele></rtept><rtept lat="45.001" lon="-122.0"><ele>12</ele></rtept></rte></gpx>`;
    const parsed = parseGpxServer(xml, "fallback");
    expect(parsed.points).toHaveLength(2);
    expect(parsed.name).toBe("Route");
  });

  it("throws on a file with fewer than 2 usable points", () => {
    const xml = `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="45.0" lon="-122.0"/></trkseg></trk></gpx>`;
    expect(() => parseGpxServer(xml, "fallback")).toThrow();
  });
});
