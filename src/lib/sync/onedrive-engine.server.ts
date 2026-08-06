// Builds a OneDrive-backed `RemoteAdapter` and hands it to the
// provider-agnostic engine in `cloud-sync-engine.server.ts`. Also handles
// the one piece of OneDrive-specific bookkeeping the generic engine doesn't
// know about: Microsoft rotates the refresh token on (almost) every use, so
// the newly issued one gets encrypted and persisted before this returns —
// otherwise the previous token eventually stops working and the connection
// silently breaks.
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

export type DecryptedOneDriveConnection = {
  id: string;
  refreshToken: string;
  syncFolder: string;
};

function ridePath(rideId: string): string {
  return `${rideId}.gpx`;
}

export async function runOneDriveSync(params: {
  supabase: SupabaseClient;
  userId: string;
  connection: DecryptedOneDriveConnection;
}): Promise<{ summary: SyncSummary; hasMore: boolean }> {
  const { supabase, userId, connection } = params;
  const onedrive = await import("./onedrive.server");

  const tokens = await onedrive.refreshAccessToken(connection.refreshToken);
  if (tokens.refreshToken !== connection.refreshToken) {
    const { encryptSecret } = await import("./token-crypto.server");
    await supabase
      .from("cloud_connections")
      .update({ encrypted_secret: await encryptSecret(tokens.refreshToken) })
      .eq("id", connection.id);
  }

  const adapter: RemoteAdapter = {
    async ensureFolder() {
      await onedrive.ensureFolder(tokens.accessToken, connection.syncFolder);
    },

    async listFiles(): Promise<RemoteFile[]> {
      const files = await onedrive.listFiles(tokens.accessToken, connection.syncFolder);
      return files.map((f) => ({
        path: f.name,
        id: f.id,
        etag: f.etag,
        lastModified: f.lastModified,
      }));
    },

    async uploadFile(path, _existingId, content) {
      return onedrive.uploadFile(tokens.accessToken, connection.syncFolder, path, content);
    },

    async downloadFile(id) {
      return onedrive.downloadFile(tokens.accessToken, id);
    },

    async deleteFile(id) {
      await onedrive.deleteFile(tokens.accessToken, id);
    },
  };

  return runCloudSync({
    supabase,
    userId,
    connectionId: connection.id,
    adapter,
    ridePath,
  });
}
