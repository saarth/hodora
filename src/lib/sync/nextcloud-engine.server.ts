// Builds a Nextcloud/WebDAV-backed `RemoteAdapter` and hands it to the
// provider-agnostic engine in `cloud-sync-engine.server.ts`. All the actual
// lock/mapping/classify/execute logic lives there now — this file only
// knows how to turn WebDAV operations into the adapter shape.
import type { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  runCloudSync,
  type RemoteAdapter,
  type RemoteFile,
  type SyncSummary,
} from "./cloud-sync-engine.server";
import type { NextcloudConnParams } from "./nextcloud-webdav.server";

export { SyncInProgressError, type SyncSummary } from "./cloud-sync-engine.server";

type SupabaseClient = ReturnType<typeof createClient<Database>>;

export type DecryptedConnection = {
  id: string;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  syncFolder: string;
};

function ridePath(folder: string, rideId: string): string {
  return `${folder}/${rideId}.gpx`;
}

async function buildAdapter(davConn: NextcloudConnParams, folder: string): Promise<RemoteAdapter> {
  const webdav = await import("./nextcloud-webdav.server");

  return {
    async ensureFolder() {
      await webdav.ensureFolder(davConn, folder);
    },

    async listFiles(): Promise<RemoteFile[]> {
      const files = await webdav.listFolder(davConn, folder);
      return files.map((f) => ({
        path: f.path,
        id: f.path,
        etag: f.etag,
        lastModified: f.lastModified,
      }));
    },

    async uploadFile(path, _existingId, content) {
      let { etag, lastModified } = await webdav.uploadFile(davConn, path, content);
      if (!etag) {
        // Some reverse proxies strip OC-ETag/ETag on PUT responses — fall
        // back to a fresh listing so the mapping baseline isn't left null
        // (a null baseline would otherwise look "changed" forever).
        const files = await webdav.listFolder(davConn, folder);
        const match = files.find((f) => f.path === path);
        etag = match?.etag ?? etag;
        lastModified = match?.lastModified ?? lastModified;
      }
      return { id: path, etag, lastModified };
    },

    async downloadFile(id) {
      return webdav.downloadFile(davConn, id);
    },

    async deleteFile(id) {
      await webdav.deleteFile(davConn, id);
    },
  };
}

export async function runNextcloudSync(params: {
  supabase: SupabaseClient;
  userId: string;
  connection: DecryptedConnection;
}): Promise<{ summary: SyncSummary; hasMore: boolean }> {
  const { supabase, userId, connection } = params;
  const davConn: NextcloudConnParams = {
    url: connection.webdavUrl,
    username: connection.webdavUsername,
    password: connection.webdavPassword,
  };
  const adapter = await buildAdapter(davConn, connection.syncFolder);

  return runCloudSync({
    supabase,
    userId,
    connectionId: connection.id,
    adapter,
    ridePath: (rideId) => ridePath(connection.syncFolder, rideId),
  });
}
