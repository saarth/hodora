// Builds a Google Drive-backed `RemoteAdapter` and hands it to the
// provider-agnostic engine in `cloud-sync-engine.server.ts`. Also handles
// the one piece of Drive-specific bookkeeping the generic engine doesn't
// know about: the sync folder is addressed by ID, not path, so its ID gets
// resolved (or created) once per run and persisted back onto the
// connection row for next time.
import type { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  runCloudSync,
  type RemoteAdapter,
  type RemoteFile,
  type SyncSummary,
} from "./cloud-sync-engine.server";

export { SyncInProgressError, type SyncSummary } from "./cloud-sync-engine.server";

type SupabaseClient = ReturnType<typeof createClient<Database>>;

export type DecryptedGoogleDriveConnection = {
  id: string;
  refreshToken: string;
  syncFolder: string;
  remoteFolderId: string | null;
};

function ridePath(rideId: string): string {
  return `${rideId}.gpx`;
}

export async function runGoogleDriveSync(params: {
  supabase: SupabaseClient;
  userId: string;
  connection: DecryptedGoogleDriveConnection;
}): Promise<{ summary: SyncSummary; hasMore: boolean }> {
  const { supabase, userId, connection } = params;
  const drive = await import("./google-drive.server");

  const { accessToken } = await drive.refreshAccessToken(connection.refreshToken);
  let folderId = connection.remoteFolderId;

  const adapter: RemoteAdapter = {
    async ensureFolder() {
      folderId = await drive.ensureFolder(accessToken, connection.syncFolder, folderId);
    },

    async listFiles(): Promise<RemoteFile[]> {
      if (!folderId) return [];
      const files = await drive.listFiles(accessToken, folderId);
      return files.map((f) => ({
        path: f.name,
        id: f.id,
        etag: f.etag,
        lastModified: f.lastModified,
      }));
    },

    async uploadFile(path, existingId, content) {
      if (!folderId) throw new Error("Drive sync folder wasn't resolved.");
      return drive.uploadFile(accessToken, folderId, path, existingId, content);
    },

    async downloadFile(id) {
      return drive.downloadFile(accessToken, id);
    },

    async deleteFile(id) {
      await drive.deleteFile(accessToken, id);
    },
  };

  const result = await runCloudSync({
    supabase,
    userId,
    connectionId: connection.id,
    adapter,
    ridePath,
  });

  if (folderId && folderId !== connection.remoteFolderId) {
    await supabase
      .from("cloud_connections")
      .update({ remote_folder_id: folderId })
      .eq("id", connection.id);
  }

  return result;
}
