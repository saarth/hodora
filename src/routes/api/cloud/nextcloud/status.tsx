import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/api-auth.server";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/cloud/nextcloud/status")({
  server: {
    handlers: {
      GET: async () => {
        const { userId, supabase } = await authenticateRequest();

        const { data, error } = await supabase
          .from("cloud_connections")
          .select("webdav_url,webdav_username,sync_folder,status,last_error,last_synced_at,syncing")
          .eq("user_id", userId)
          .eq("provider", "nextcloud")
          .maybeSingle();

        if (error) {
          return jsonResponse({ ok: false, message: error.message }, 400);
        }
        if (!data) {
          return jsonResponse({ connected: false }, 200);
        }

        return jsonResponse(
          {
            connected: true,
            webdavUrl: data.webdav_url,
            username: data.webdav_username,
            folder: data.sync_folder,
            status: data.status,
            lastError: data.last_error,
            lastSyncedAt: data.last_synced_at,
            syncing: data.syncing,
          },
          200,
        );
      },
    },
  },
});
