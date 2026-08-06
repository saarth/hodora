// Pure decision function for the Nextcloud sync engine: given what's known
// about a ride/remote-file pair — the local ride (if it still exists), the
// last-synced mapping snapshot (if one exists), and the remote file (if it
// still exists) — decides exactly one action to take. No I/O, so every case
// is a plain table-driven unit test; the engine (`nextcloud-engine.server.ts`)
// is the only thing that actually executes an action.
export type LocalRideInfo = { updatedAt: string };
export type MappingInfo = { localUpdatedAt: string | null; remoteEtag: string | null };
export type RemoteFileInfo = { etag: string; lastModified: string | null };

export type SyncAction =
  | "upload-new"
  | "download-new"
  | "upload"
  | "download"
  | "delete-remote"
  | "delete-local"
  | "conflict"
  | "noop"
  | "stale-cleanup";

function localChangedSinceMapping(local: LocalRideInfo, mapping: MappingInfo): boolean {
  return mapping.localUpdatedAt === null || local.updatedAt !== mapping.localUpdatedAt;
}

function remoteChangedSinceMapping(remote: RemoteFileInfo, mapping: MappingInfo): boolean {
  return mapping.remoteEtag === null || remote.etag !== mapping.remoteEtag;
}

export function classifySyncPair(
  local: LocalRideInfo | null,
  mapping: MappingInfo | null,
  remote: RemoteFileInfo | null,
): SyncAction {
  if (!mapping) {
    if (local && !remote) return "upload-new";
    if (!local && remote) return "download-new";
    if (!local && !remote) return "stale-cleanup";
    // Both sides exist with no recorded mapping — e.g. the mapping row was
    // lost but the ride and its remote file (same deterministic <ride-id>.gpx
    // path) both survived. Treat it like any other conflict rather than
    // silently picking a side: the engine resolves it by comparing
    // local.updatedAt against remote.lastModified.
    return "conflict";
  }

  if (!local && !remote) return "stale-cleanup";
  if (!local && remote) return "delete-remote";
  if (local && !remote) {
    return localChangedSinceMapping(local, mapping) ? "upload" : "delete-local";
  }

  const localChanged = localChangedSinceMapping(local!, mapping);
  const remoteChanged = remoteChangedSinceMapping(remote!, mapping);
  if (localChanged && remoteChanged) return "conflict";
  if (localChanged) return "upload";
  if (remoteChanged) return "download";
  return "noop";
}
