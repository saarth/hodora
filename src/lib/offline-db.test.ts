import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ride, RideSummary } from "./rides";

const point = (lat: number, lon: number, d = 0) => ({ lat, lon, ele: 0, d });

function makeRide(id: string, overrides: Partial<Ride> = {}): Ride {
  return {
    id,
    user_id: "guest",
    name: `Ride ${id}`,
    description: null,
    source_filename: null,
    distance_m: 1000,
    ascent_m: 10,
    descent_m: 10,
    min_lat: null,
    min_lon: null,
    max_lat: null,
    max_lon: null,
    points: [point(51.5, -0.1), point(51.51, -0.11, 1000)],
    difficulty: null,
    surface: null,
    notes: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("offline-db", () => {
  beforeEach(() => {
    // Fresh in-memory IndexedDB per test so ride/meta stores don't leak
    // state across tests that reuse the same database name.
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("round-trips a ride through put/get, stamping savedAt without altering the stored ride shape", async () => {
    const { putOfflineRide, getOfflineRide } = await import("./offline-db");
    const ride = makeRide("a");
    await putOfflineRide(ride);
    const back = await getOfflineRide("a");
    expect(back).not.toBeNull();
    expect(back).toMatchObject(ride);
  });

  it("returns null for a ride that was never saved", async () => {
    const { getOfflineRide } = await import("./offline-db");
    expect(await getOfflineRide("missing")).toBeNull();
  });

  it("overwrites an existing ride with the same id instead of duplicating it", async () => {
    const { putOfflineRide, getOfflineRide, listOfflineRides } = await import("./offline-db");
    await putOfflineRide(makeRide("a", { name: "Original" }));
    await putOfflineRide(makeRide("a", { name: "Renamed" }));
    const rides = await listOfflineRides();
    expect(rides).toHaveLength(1);
    expect((await getOfflineRide("a"))?.name).toBe("Renamed");
  });

  it("deletes a ride", async () => {
    const { putOfflineRide, deleteOfflineRide, getOfflineRide } = await import("./offline-db");
    await putOfflineRide(makeRide("a"));
    await deleteOfflineRide("a");
    expect(await getOfflineRide("a")).toBeNull();
  });

  it("deleting a ride that was never saved does not throw", async () => {
    const { deleteOfflineRide } = await import("./offline-db");
    await expect(deleteOfflineRide("missing")).resolves.toBeUndefined();
  });

  it("lists saved ride ids and full rides", async () => {
    const { putOfflineRide, listOfflineRideIds, listOfflineRides } = await import("./offline-db");
    await putOfflineRide(makeRide("a"));
    await putOfflineRide(makeRide("b"));
    expect((await listOfflineRideIds()).sort()).toEqual(["a", "b"]);
    expect((await listOfflineRides()).map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("caches and returns the ride list summary", async () => {
    const { putRideList, getRideList } = await import("./offline-db");
    const summaries = [makeRide("a"), makeRide("b")] as unknown as RideSummary[];
    expect(await getRideList()).toBeNull();
    await putRideList(summaries);
    expect(await getRideList()).toEqual(summaries);
  });

  it("caches and returns the profile, including an explicit null", async () => {
    const { putCachedProfile, getCachedProfile } = await import("./offline-db");
    expect(await getCachedProfile()).toBeNull();
    const profile = {
      id: "u1",
      username: "rider",
      display_name: "Rider",
      avatar_url: null,
      unit: "metric" as const,
    };
    await putCachedProfile(profile);
    expect(await getCachedProfile()).toEqual(profile);

    await putCachedProfile(null);
    expect(await getCachedProfile()).toBeNull();
  });

  it("clearOfflineData wipes rides and cached meta", async () => {
    const {
      putOfflineRide,
      putRideList,
      putCachedProfile,
      clearOfflineData,
      listOfflineRides,
      getRideList,
      getCachedProfile,
    } = await import("./offline-db");
    await putOfflineRide(makeRide("a"));
    await putRideList([makeRide("a")] as unknown as RideSummary[]);
    await putCachedProfile({
      id: "u1",
      username: "rider",
      display_name: null,
      avatar_url: null,
      unit: "metric",
    });

    await clearOfflineData();

    expect(await listOfflineRides()).toEqual([]);
    expect(await getRideList()).toBeNull();
    expect(await getCachedProfile()).toBeNull();
  });

  it("clearOfflineData only deletes Hodora's own tile cache, not other Cache Storage buckets", async () => {
    const deleted: string[] = [];
    vi.stubGlobal("caches", {
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });
    const { clearOfflineData } = await import("./offline-db");
    await clearOfflineData();
    expect(deleted).toEqual(["map-tiles"]);
    vi.unstubAllGlobals();
  });

  it("getOfflineRide resolves to null instead of throwing when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const { getOfflineRide } = await import("./offline-db");
    await expect(getOfflineRide("a")).resolves.toBeNull();
  });
});
