import { describe, expect, it, vi } from "vitest";
import { runCloudSync, type RemoteAdapter, type RemoteFile } from "./cloud-sync-engine.server";

const T1 = "2026-08-01T00:00:00.000Z";
const REWRITTEN_AT = "2026-08-01T00:05:00.000Z";

type RideRow = { id: string; name: string; updated_at: string };
type MappingRow = {
  ride_id: string | null;
  remote_path: string;
  remote_etag: string | null;
  local_updated_at: string | null;
};

/**
 * A minimal fake of the Supabase query-builder surface `cloud-sync-engine.server.ts`
 * and `rides-sync.server.ts` actually call. Each `.from(table)` chain is
 * dispatched by table + the sequence of method names once awaited, which is
 * enough to cover acquireLock/releaseLock, listMappings/upsertMapping/
 * deleteMapping*, and listRidesForSync/deleteRideForSync — everything a
 * `delete-local`-only sync run touches.
 */
function makeFakeSupabase(state: {
  rides: RideRow[];
  mappings: MappingRow[];
  connectionUpdates: Record<string, unknown>[];
  deletedRideIds: string[];
}) {
  function chain(table: string, calls: { method: string; args: unknown[] }[]) {
    const record = (method: string, args: unknown[]) => chain(table, [...calls, { method, args }]);
    const handler: ProxyHandler<() => void> = {
      get(_target, prop: string) {
        if (prop === "then") {
          const result = resolve(table, calls);
          return Promise.resolve(result).then.bind(Promise.resolve(result));
        }
        return (...args: unknown[]) => record(prop, args);
      },
    };
    return new Proxy(() => {}, handler);
  }

  function resolve(table: string, calls: { method: string; args: unknown[] }[]) {
    const method = (name: string) => calls.find((c) => c.method === name);
    const eqValue = (col: string) =>
      calls.find((c) => c.method === "eq" && c.args[0] === col)?.args[1] as string | undefined;

    if (table === "cloud_connections") {
      if (method("or")) {
        // acquireLock
        return { data: { id: eqValue("id") }, error: null };
      }
      // releaseLock
      const patch = method("update")?.args[0] as Record<string, unknown>;
      state.connectionUpdates.push(patch);
      return { error: null };
    }

    if (table === "ride_sync_state") {
      if (method("select")) {
        return { data: state.mappings, error: null };
      }
      if (method("upsert")) {
        const row = method("upsert")?.args[0] as {
          ride_id: string;
          remote_path: string;
          remote_etag: string | null;
          local_updated_at: string | null;
        };
        const existing = state.mappings.find((m) => m.ride_id === row.ride_id);
        if (existing) Object.assign(existing, row);
        else
          state.mappings.push({
            ride_id: row.ride_id,
            remote_path: row.remote_path,
            remote_etag: row.remote_etag,
            local_updated_at: row.local_updated_at,
          });
        return { error: null };
      }
      if (method("delete")) {
        return { error: null };
      }
    }

    if (table === "rides") {
      if (method("select") && !method("eq")) {
        return { data: state.rides, error: null };
      }
      if (method("delete")) {
        const id = eqValue("id")!;
        state.deletedRideIds.push(id);
        state.rides = state.rides.filter((r) => r.id !== id);
        return { error: null };
      }
      if (method("update") && method("single")) {
        // upsertRideFromSync's "update an existing ride" branch (a "download" onto an already-mapped ride).
        const id = eqValue("id")!;
        const ride = state.rides.find((r) => r.id === id)!;
        ride.updated_at = REWRITTEN_AT;
        return { data: { id: ride.id, updated_at: ride.updated_at }, error: null };
      }
    }

    throw new Error(
      `Unhandled fake-supabase call: ${table} ${calls.map((c) => c.method).join(".")}`,
    );
  }

  return { from: (table: string) => chain(table, []) } as never;
}

function makeAdapter(files: RemoteFile[]): RemoteAdapter {
  return {
    ensureFolder: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue(files),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  };
}

describe("runCloudSync — mass local-deletion guard", () => {
  it("refuses to delete local rides when the remote listing comes back empty for a connection with existing mappings", async () => {
    const state = {
      rides: [
        { id: "ride-a", name: "A", updated_at: T1 },
        { id: "ride-b", name: "B", updated_at: T1 },
      ],
      mappings: [
        {
          ride_id: "ride-a",
          remote_path: "/Hodora/a.gpx",
          remote_etag: "e1",
          local_updated_at: T1,
        },
        {
          ride_id: "ride-b",
          remote_path: "/Hodora/b.gpx",
          remote_etag: "e2",
          local_updated_at: T1,
        },
      ],
      connectionUpdates: [] as Record<string, unknown>[],
      deletedRideIds: [] as string[],
    };
    const supabase = makeFakeSupabase(state);
    const adapter = makeAdapter([]); // empty listing — the failure mode under test

    const { summary } = await runCloudSync({
      supabase,
      userId: "user-1",
      connectionId: "conn-1",
      adapter,
      ridePath: (id) => `/Hodora/${id}.gpx`,
    });

    expect(state.deletedRideIds).toEqual([]);
    expect(summary.deletedLocal).toBe(0);
    expect(summary.errors).toBeGreaterThan(0);

    const finalUpdate = state.connectionUpdates.at(-1);
    expect(finalUpdate).toMatchObject({ status: "error" });
    expect(String(finalUpdate?.last_error)).toMatch(/empty/i);
  });

  it("still deletes a genuinely-removed local ride when the listing is non-empty (only that one file is missing)", async () => {
    const state = {
      rides: [
        { id: "ride-a", name: "A", updated_at: T1 },
        { id: "ride-b", name: "B", updated_at: T1 },
      ],
      mappings: [
        {
          ride_id: "ride-a",
          remote_path: "/Hodora/a.gpx",
          remote_etag: "e1",
          local_updated_at: T1,
        },
        {
          ride_id: "ride-b",
          remote_path: "/Hodora/b.gpx",
          remote_etag: "e2",
          local_updated_at: T1,
        },
      ],
      connectionUpdates: [] as Record<string, unknown>[],
      deletedRideIds: [] as string[],
    };
    const supabase = makeFakeSupabase(state);
    // Ride A's file is still there and unchanged; ride B's was genuinely removed remotely.
    const adapter = makeAdapter([
      { path: "/Hodora/a.gpx", id: "/Hodora/a.gpx", etag: "e1", lastModified: null },
    ]);

    const { summary } = await runCloudSync({
      supabase,
      userId: "user-1",
      connectionId: "conn-1",
      adapter,
      ridePath: (id) => `/Hodora/${id}.gpx`,
    });

    expect(state.deletedRideIds).toEqual(["ride-b"]);
    expect(summary.deletedLocal).toBe(1);
    expect(summary.errors).toBe(0);
    expect(state.connectionUpdates.at(-1)).toMatchObject({ status: "active" });
  });
});

const GPX_TWO_POINTS = `<?xml version="1.0"?>
<gpx><trk><name>Ride A</name><trkseg>
  <trkpt lat="51.5" lon="-0.1"><ele>10</ele></trkpt>
  <trkpt lat="51.51" lon="-0.11"><ele>12</ele></trkpt>
</trkseg></trk></gpx>`;

describe("runCloudSync — etag-stripping proxy doesn't cause perpetual re-download churn", () => {
  it("stabilizes on the second run once the effective (path-fallback) etag is what actually got persisted", async () => {
    // Simulates a WebDAV reverse proxy that never returns an ETag/OC-ETag —
    // every listing forever reports etag: null for this file.
    const state = {
      rides: [{ id: "ride-a", name: "A", updated_at: T1 }],
      mappings: [
        {
          ride_id: "ride-a",
          remote_path: "/Hodora/ride-a.gpx",
          remote_etag: null,
          local_updated_at: T1,
        },
      ],
      connectionUpdates: [] as Record<string, unknown>[],
      deletedRideIds: [] as string[],
    };
    const supabase = makeFakeSupabase(state);
    const remoteFile: RemoteFile = {
      path: "/Hodora/ride-a.gpx",
      id: "/Hodora/ride-a.gpx",
      etag: null, // never available, every single run
      lastModified: "Sat, 01 Aug 2026 00:00:00 GMT",
    };
    const adapter = makeAdapter([remoteFile]);
    adapter.downloadFile = vi.fn().mockResolvedValue(GPX_TWO_POINTS);

    // Run 1: the stored mapping still has the old bug's `remote_etag: null`
    // baseline, so this run (correctly) treats it as changed and downloads.
    const run1 = await runCloudSync({
      supabase,
      userId: "user-1",
      connectionId: "conn-1",
      adapter,
      ridePath: (id) => `/Hodora/${id}.gpx`,
    });
    expect(run1.summary.downloaded).toBe(1);
    // The fix: the mapping now stores the same fallback value classification
    // compares against (the remote path), not the raw null etag.
    expect(state.mappings[0].remote_etag).toBe("/Hodora/ride-a.gpx");

    // Run 2: nothing changed on either side, and the "no etag" proxy
    // behavior is still in effect. This must classify as noop, not
    // download-again — that's the churn this fix closes.
    const run2 = await runCloudSync({
      supabase,
      userId: "user-1",
      connectionId: "conn-1",
      adapter,
      ridePath: (id) => `/Hodora/${id}.gpx`,
    });
    expect(run2.summary.downloaded).toBe(0);
    expect(run2.summary.uploaded).toBe(0);
    expect(run2.summary.conflicts).toBe(0);
  });
});
