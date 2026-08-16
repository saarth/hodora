import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RidePoint } from "./gpx";

// Guest (signed-out) rides never touch the network — `isSignedIn()` calls
// through to this mock and every guest code path in rides.ts branches off
// its result, so a minimal auth-only mock is enough to exercise them.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: vi.fn(() => {
      throw new Error("guest rides must not hit the network");
    }),
  },
}));

const point = (lat: number, lon: number, d = 0): RidePoint => ({ lat, lon, ele: 0, d });

describe("rides.ts (guest / offline)", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("createRide rejects a route with fewer than two points", async () => {
    const { createRide } = await import("./rides");
    await expect(
      createRide({
        name: "Too short",
        sourceFilename: null,
        distanceM: 0,
        ascentM: 0,
        descentM: 0,
        bounds: null,
        points: [point(0, 0)],
      }),
    ).rejects.toThrow(/at least two points/);
  });

  it("createRide saves a guest ride locally with null tags and empty notes", async () => {
    const { createRide, fetchRide } = await import("./rides");
    const id = await createRide({
      name: "Local loop",
      sourceFilename: "loop.gpx",
      distanceM: 1234.6,
      ascentM: 50.4,
      descentM: 49.6,
      bounds: { minLat: 0, minLon: 0, maxLat: 1, maxLon: 1 },
      points: [point(0, 0), point(0.01, 0.01, 1234.6)],
    });

    const ride = await fetchRide(id);
    expect(ride.user_id).toBe("guest");
    expect(ride.name).toBe("Local loop");
    expect(ride.distance_m).toBe(1235); // rounded
    expect(ride.difficulty).toBeNull();
    expect(ride.surface).toBeNull();
    expect(ride.notes).toEqual([]);
  });

  it("fetchRides lists locally saved guest rides, newest first, without points/notes", async () => {
    const { createRide, fetchRides } = await import("./rides");
    const firstId = await createRide({
      name: "First",
      sourceFilename: null,
      distanceM: 1000,
      ascentM: 0,
      descentM: 0,
      bounds: null,
      points: [point(0, 0), point(0, 0.01, 1000)],
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const secondId = await createRide({
      name: "Second",
      sourceFilename: null,
      distanceM: 2000,
      ascentM: 0,
      descentM: 0,
      bounds: null,
      points: [point(0, 0), point(0, 0.02, 2000)],
    });

    const summaries = await fetchRides();
    expect(summaries.map((r) => r.id)).toEqual([secondId, firstId]);
    expect(summaries[0]).not.toHaveProperty("points");
    expect(summaries[0]).not.toHaveProperty("notes");
  });

  it("updateRideTags sets difficulty/surface and null explicitly clears a tag", async () => {
    const { createRide, updateRideTags, fetchRide } = await import("./rides");
    const id = await createRide({
      name: "Tagged",
      sourceFilename: null,
      distanceM: 1000,
      ascentM: 0,
      descentM: 0,
      bounds: null,
      points: [point(0, 0), point(0, 0.01, 1000)],
    });

    await updateRideTags(id, { difficulty: "hard", surface: "gravel" });
    let ride = await fetchRide(id);
    expect(ride.difficulty).toBe("hard");
    expect(ride.surface).toBe("gravel");

    // Omitting a field leaves it unchanged.
    await updateRideTags(id, { difficulty: "easy" });
    ride = await fetchRide(id);
    expect(ride.difficulty).toBe("easy");
    expect(ride.surface).toBe("gravel");

    // Explicit null clears it.
    await updateRideTags(id, { surface: null });
    ride = await fetchRide(id);
    expect(ride.surface).toBeNull();
  });

  it("updateRideNotes replaces the full notes list", async () => {
    const { createRide, updateRideNotes, fetchRide } = await import("./rides");
    const id = await createRide({
      name: "Noted",
      sourceFilename: null,
      distanceM: 1000,
      ascentM: 0,
      descentM: 0,
      bounds: null,
      points: [point(0, 0), point(0, 0.01, 1000)],
    });

    await updateRideNotes(id, [
      {
        id: "n1",
        distanceM: 100,
        lat: 0,
        lon: 0.001,
        text: "Water stop",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    let ride = await fetchRide(id);
    expect(ride.notes).toHaveLength(1);
    expect(ride.notes[0].text).toBe("Water stop");

    await updateRideNotes(id, []);
    ride = await fetchRide(id);
    expect(ride.notes).toEqual([]);
  });

  it("renameRide updates the local name", async () => {
    const { createRide, renameRide, fetchRide } = await import("./rides");
    const id = await createRide({
      name: "Old name",
      sourceFilename: null,
      distanceM: 1000,
      ascentM: 0,
      descentM: 0,
      bounds: null,
      points: [point(0, 0), point(0, 0.01, 1000)],
    });
    await renameRide(id, "New name");
    expect((await fetchRide(id)).name).toBe("New name");
  });

  it("deleteRide removes the ride from local storage", async () => {
    const { createRide, deleteRide, fetchRide } = await import("./rides");
    const id = await createRide({
      name: "Temp",
      sourceFilename: null,
      distanceM: 1000,
      ascentM: 0,
      descentM: 0,
      bounds: null,
      points: [point(0, 0), point(0, 0.01, 1000)],
    });
    await deleteRide(id);
    await expect(fetchRide(id)).rejects.toThrow(/not found/i);
  });

  it("fetchProfile returns null for a guest without touching the network", async () => {
    const { fetchProfile } = await import("./rides");
    expect(await fetchProfile()).toBeNull();
  });
});
