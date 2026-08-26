import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/api-auth.server";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/cloud/onedrive/sync")({
  server: {
    handlers: {
      POST: async () => {
        const { userId, supabase } = await authenticateRequest();

        const { data: row, error } = await supabase
          .from("cloud_connections")
          .select("id,encrypted_secret,sync_folder")
          .eq("user_id", userId)
          .eq("provider", "onedrive")
          .maybeSingle();

        if (error) {
          return jsonResponse({ ok: false, message: error.message }, 400);
        }
        if (!row || !row.encrypted_secret) {
          return jsonResponse({ ok: false, message: "OneDrive isn't connected." }, 400);
        }

        const { decryptSecret } = await import("@/lib/sync/token-crypto.server");
        const { runOneDriveSync, SyncInProgressError } =
          await import("@/lib/sync/onedrive-engine.server");

        try {
          const refreshToken = await decryptSecret(row.encrypted_secret);
          const { summary, hasMore } = await runOneDriveSync({
            supabase,
            userId,
            connection: { id: row.id, refreshToken, syncFolder: row.sync_folder },
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
