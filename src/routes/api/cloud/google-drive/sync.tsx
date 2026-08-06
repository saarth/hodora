import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/api-auth.server";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/cloud/google-drive/sync")({
  server: {
    handlers: {
      POST: async () => {
        const { userId, supabase } = await authenticateRequest();

        const { data: row, error } = await supabase
          .from("cloud_connections")
          .select("id,encrypted_secret,sync_folder,remote_folder_id")
          .eq("user_id", userId)
          .eq("provider", "google_drive")
          .maybeSingle();

        if (error) {
          return jsonResponse({ ok: false, message: error.message }, 400);
        }
        if (!row || !row.encrypted_secret) {
          return jsonResponse({ ok: false, message: "Google Drive isn't connected." }, 400);
        }

        const { decryptSecret } = await import("@/lib/sync/token-crypto.server");
        const { runGoogleDriveSync, SyncInProgressError } =
          await import("@/lib/sync/google-drive-engine.server");

        try {
          const refreshToken = await decryptSecret(row.encrypted_secret);
          const { summary, hasMore } = await runGoogleDriveSync({
            supabase,
            userId,
            connection: {
              id: row.id,
              refreshToken,
              syncFolder: row.sync_folder,
              remoteFolderId: row.remote_folder_id,
            },
          });
          return jsonResponse({ ok: true, summary, hasMore }, 200);
        } catch (syncError) {
          if (syncError instanceof SyncInProgressError) {
            return jsonResponse({ ok: false, message: syncError.message }, 409);
          }
          const message = syncError instanceof Error ? syncError.message : "Sync failed.";
          return jsonResponse({ ok: false, message }, 400);
        }
      },
    },
  },
});
