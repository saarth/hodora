// Provider-agnostic two-way sync pass between a user's rides and a remote
// folder: acquires a soft per-connection lock, does three round trips (rides
// summary, sync-state mapping rows, remote folder listing), classifies every
// ride/file pair via `classifySyncPair`, executes each action with its own
// try/catch (one bad item can't abort the batch), and caps work per call so
// a large first sync drains over a couple of calls instead of one huge
// request.
//
// Originally this lived only in `nextcloud-engine.server.ts`. It's factored
// out here, behind a small `RemoteAdapter` interface, so the Google Drive
// and OneDrive engines can reuse the same lock/mapping/classify/execute
// logic instead of re-implementing it — only the low-level "list/upload/
// download/delete a file" operations differ per provider, and those already
// live in each provider's own REST client module.
import type { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { toGpx } from "@/lib/gpx";
import { classifySyncPair, type MappingInfo, type SyncAction } from "./classify";
import { parseGpxServer } from "./gpx-remote.server";
import {
  deleteRideForSync,
  fetchRideForSync,
  listRidesForSync,
  upsertRideFromSync,
  type RideSyncSummary,
} from "./rides-sync.server";

type SupabaseClient = ReturnType<typeof createClient<Database>>;

export type SyncSummary = {
  uploaded: number;
  downloaded: number;
  deletedRemote: number;
  deletedLocal: number;
  conflicts: number;
  errors: number;
};

export class SyncInProgressError extends Error {
  constructor() {
    super("A sync for this connection is already in progress.");
    this.name = "SyncInProgressError";
  }
}

/** What every provider's remote listing/upload/download/delete boils down to. `path` is an opaque per-connection-unique key (a literal WebDAV path for Nextcloud, just `<rideId>.gpx` for providers with no real path concept) — it's never parsed except to derive a fallback ride name. `id` is whatever the provider needs to address that same file directly (for WebDAV, `id` and `path` are the same string). */
export type RemoteFile = {
  path: string;
  id: string;
  etag: string | null;
  lastModified: string | null;
};

export type RemoteAdapter = {
  ensureFolder(): Promise<void>;
  listFiles(): Promise<RemoteFile[]>;
  /** `existingId` is set when overwriting a file found in the latest `listFiles()` — null means "create new". */
  uploadFile(
    path: string,
    existingId: string | null,
    content: string,
  ): Promise<{ id: string; etag: string | null; lastModified: string | null }>;
  downloadFile(id: string): Promise<string>;
  deleteFile(id: string): Promise<void>;
};

const STALE_LOCK_MS = 2 * 60 * 1000;
const MAX_ITEMS_PER_RUN = 25;

function ridePathFallbackName(path: string): string {
  const base = path.split("/").pop() ?? "Imported route";
  return base.replace(/\.gpx$/i, "");
}

async function acquireLock(supabase: SupabaseClient, connectionId: string): Promise<void> {
  const staleThreshold = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data, error } = await supabase
    .from("cloud_connections")
    .update({ syncing: true, sync_started_at: new Date().toISOString() })
    .eq("id", connectionId)
    .or(`syncing.eq.false,sync_started_at.lt.${staleThreshold}`)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new SyncInProgressError();
}

async function releaseLock(
  supabase: SupabaseClient,
  connectionId: string,
  outcome: { status: "active" | "error"; lastError: string | null },
): Promise<void> {
  await supabase
    .from("cloud_connections")
    .update({
      syncing: false,
      status: outcome.status,
      last_error: outcome.lastError,
      ...(outcome.status === "active" ? { last_synced_at: new Date().toISOString() } : {}),
    })
    .eq("id", connectionId);
}

type MappingRow = {
  rideId: string | null;
  remotePath: string;
  remoteEtag: string | null;
  localUpdatedAt: string | null;
};

async function listMappings(supabase: SupabaseClient, connectionId: string): Promise<MappingRow[]> {
  const { data, error } = await supabase
    .from("ride_sync_state")
    .select("ride_id,remote_path,remote_etag,local_updated_at")
    .eq("connection_id", connectionId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    rideId: r.ride_id,
    remotePath: r.remote_path,
    remoteEtag: r.remote_etag,
    localUpdatedAt: r.local_updated_at,
  }));
}

async function upsertMapping(
  supabase: SupabaseClient,
  connectionId: string,
  userId: string,
  input: {
    rideId: string;
    remotePath: string;
    remoteEtag: string | null;
    remoteUpdatedAt: string | null;
    localUpdatedAt: string;
  },
): Promise<void> {
  const { error } = await supabase.from("ride_sync_state").upsert(
    {
      connection_id: connectionId,
      user_id: userId,
      ride_id: input.rideId,
      remote_path: input.remotePath,
      remote_etag: input.remoteEtag,
      remote_updated_at: input.remoteUpdatedAt,
      local_updated_at: input.localUpdatedAt,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "connection_id,ride_id" },
  );
  if (error) throw error;
}

async function deleteMappingByRideId(
  supabase: SupabaseClient,
  connectionId: string,
  rideId: string,
): Promise<void> {
  await supabase
    .from("ride_sync_state")
    .delete()
    .eq("connection_id", connectionId)
    .eq("ride_id", rideId);
}

async function deleteMappingByPath(
  supabase: SupabaseClient,
  connectionId: string,
  remotePath: string,
): Promise<void> {
  await supabase
    .from("ride_sync_state")
    .delete()
    .eq("connection_id", connectionId)
    .eq("remote_path", remotePath);
}

type Pair = { rideId: string | null; remotePath: string; mapping: MappingRow | null };

function buildPairs(
  rides: RideSyncSummary[],
  remoteFiles: RemoteFile[],
  mappings: MappingRow[],
  ridePath: (rideId: string) => string,
): Pair[] {
  const pairs: Pair[] = [];
  const seenRideIds = new Set<string>();
  const seenPaths = new Set<string>();

  for (const m of mappings) {
    pairs.push({ rideId: m.rideId, remotePath: m.remotePath, mapping: m });
    if (m.rideId) seenRideIds.add(m.rideId);
    seenPaths.add(m.remotePath);
  }
  for (const ride of rides) {
    if (seenRideIds.has(ride.id)) continue;
    const path = ridePath(ride.id);
    if (seenPaths.has(path)) continue;
    pairs.push({ rideId: ride.id, remotePath: path, mapping: null });
    seenPaths.add(path);
  }
  for (const file of remoteFiles) {
    if (seenPaths.has(file.path)) continue;
    pairs.push({ rideId: null, remotePath: file.path, mapping: null });
    seenPaths.add(file.path);
  }
  return pairs;
}

export async function runCloudSync(params: {
  supabase: SupabaseClient;
  userId: string;
  connectionId: string;
  adapter: RemoteAdapter;
  ridePath: (rideId: string) => string;
}): Promise<{ summary: SyncSummary; hasMore: boolean }> {
  const { supabase, userId, connectionId, adapter, ridePath } = params;
  await acquireLock(supabase, connectionId);

  const summary: SyncSummary = {
    uploaded: 0,
    downloaded: 0,
    deletedRemote: 0,
    deletedLocal: 0,
    conflicts: 0,
    errors: 0,
  };

  try {
    await adapter.ensureFolder();

    const [rides, mappings, remoteFiles] = await Promise.all([
      listRidesForSync(supabase),
      listMappings(supabase, connectionId),
      adapter.listFiles(),
    ]);

    const rideById = new Map(rides.map((r) => [r.id, r]));
    const remoteByPath = new Map(remoteFiles.map((f) => [f.path, f]));

    const allPairs = buildPairs(rides, remoteFiles, mappings, ridePath);
    const toProcess = allPairs.slice(0, MAX_ITEMS_PER_RUN);
    const hasMore = allPairs.length > toProcess.length;

    for (const pair of toProcess) {
      try {
        const ride = pair.rideId ? (rideById.get(pair.rideId) ?? null) : null;
        const remoteFile = remoteByPath.get(pair.remotePath) ?? null;
        const localInfo = ride ? { updatedAt: ride.updatedAt } : null;
        const remoteInfo = remoteFile
          ? { etag: remoteFile.etag ?? remoteFile.path, lastModified: remoteFile.lastModified }
          : null;
        const mappingInfo: MappingInfo | null = pair.mapping
          ? { localUpdatedAt: pair.mapping.localUpdatedAt, remoteEtag: pair.mapping.remoteEtag }
          : null;

        let action = classifySyncPair(localInfo, mappingInfo, remoteInfo);
        if (action === "conflict") {
          summary.conflicts++;
          const localTime = localInfo ? Date.parse(localInfo.updatedAt) : -Infinity;
          const remoteTime = remoteInfo?.lastModified
            ? Date.parse(remoteInfo.lastModified)
            : -Infinity;
          // Newest wins; ties (including "neither side has a usable timestamp") go to local.
          action = remoteTime > localTime ? "download" : "upload";
        }

        await executeAction({
          action,
          supabase,
          userId,
          connectionId,
          adapter,
          rideId: pair.rideId,
          remotePath: pair.remotePath,
          remoteFile,
        });

        if (action === "upload" || action === "upload-new") summary.uploaded++;
        else if (action === "download" || action === "download-new") summary.downloaded++;
        else if (action === "delete-remote") summary.deletedRemote++;
        else if (action === "delete-local") summary.deletedLocal++;
      } catch (itemError) {
        summary.errors++;
        const message = itemError instanceof Error ? itemError.message : String(itemError);
        console.error(
          `[cloud-sync] item failed (ride=${pair.rideId} path=${pair.remotePath}): ${message}`,
        );
      }
    }

    await releaseLock(supabase, connectionId, { status: "active", lastError: null });
    return { summary, hasMore };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await releaseLock(supabase, connectionId, { status: "error", lastError: message });
    throw error;
  }
}

async function executeAction(ctx: {
  action: Exclude<SyncAction, "conflict">;
  supabase: SupabaseClient;
  userId: string;
  connectionId: string;
  adapter: RemoteAdapter;
  rideId: string | null;
  remotePath: string;
  remoteFile: RemoteFile | null;
}): Promise<void> {
  const { action, supabase, userId, connectionId, adapter, rideId, remotePath, remoteFile } = ctx;

  switch (action) {
    case "noop":
      return;

    case "stale-cleanup":
      if (rideId) await deleteMappingByRideId(supabase, connectionId, rideId);
      else await deleteMappingByPath(supabase, connectionId, remotePath);
      return;

    case "upload":
    case "upload-new": {
      if (!rideId) throw new Error("upload action requires a ride id");
      const fullRide = await fetchRideForSync(supabase, rideId);
      const gpx = toGpx(fullRide);
      const { etag, lastModified } = await adapter.uploadFile(
        remotePath,
        remoteFile?.id ?? null,
        gpx,
      );
      await upsertMapping(supabase, connectionId, userId, {
        rideId,
        remotePath,
        remoteEtag: etag,
        remoteUpdatedAt: lastModified,
        localUpdatedAt: fullRide.updated_at,
      });
      return;
    }

    case "download":
    case "download-new": {
      if (!remoteFile) throw new Error("download action requires a remote file");
      const xml = await adapter.downloadFile(remoteFile.id);
      const parsed = parseGpxServer(xml, ridePathFallbackName(remotePath));
      const written = await upsertRideFromSync(supabase, userId, {
        id: rideId ?? undefined,
        name: parsed.name,
        sourceFilename: null,
        distanceM: parsed.distanceM,
        ascentM: parsed.ascentM,
        descentM: parsed.descentM,
        bounds: parsed.bounds,
        points: parsed.points,
      });
      await upsertMapping(supabase, connectionId, userId, {
        rideId: written.id,
        remotePath,
        remoteEtag: remoteFile.etag,
        remoteUpdatedAt: remoteFile.lastModified,
        localUpdatedAt: written.updatedAt,
      });
      return;
    }

    case "delete-remote": {
      if (remoteFile) await adapter.deleteFile(remoteFile.id);
      if (rideId) await deleteMappingByRideId(supabase, connectionId, rideId);
      else await deleteMappingByPath(supabase, connectionId, remotePath);
      return;
    }

    case "delete-local": {
      if (!rideId) throw new Error("delete-local action requires a ride id");
      await deleteRideForSync(supabase, rideId);
      await deleteMappingByRideId(supabase, connectionId, rideId);
      return;
    }
  }
}
