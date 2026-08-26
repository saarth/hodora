import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { authenticateRequest } from "@/lib/api-auth.server";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Connects (or reconnects with new credentials) the caller's Nextcloud account. */
export const Route = createFileRoute("/api/cloud/nextcloud/connect")({
  server: {
    handlers: {
      POST: async () => {
        const { userId, supabase } = await authenticateRequest();

        const request = getRequest();
        const body = (await request.json().catch(() => null)) as {
          url?: string;
          username?: string;
          appPassword?: string;
          folder?: string;
        } | null;

        const url = body?.url?.trim();
        const username = body?.username?.trim();
        const appPassword = body?.appPassword;
        const folder = body?.folder?.trim() || "/Hodora";

        if (!url || !username || !appPassword) {
          return jsonResponse(
            { ok: false, message: "Server URL, username, and app password are required." },
            400,
          );
        }

        const { testConnection, ensureFolder } = await import("@/lib/sync/nextcloud-webdav.server");
        const davConn = { url, username, password: appPassword };

        const result = await testConnection(davConn);
        if (!result.ok) {
          return jsonResponse({ ok: false, message: result.message }, 400);
        }

        try {
          await ensureFolder(davConn, folder);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not create the sync folder.";
          return jsonResponse({ ok: false, message }, 400);
        }

        const { encryptSecret } = await import("@/lib/sync/token-crypto.server");
        const encryptedSecret = await encryptSecret(appPassword);

        const { data, error } = await supabase
          .from("cloud_connections")
          .upsert(
            {
              user_id: userId,
              provider: "nextcloud",
              webdav_url: url,
              webdav_username: username,
              encrypted_secret: encryptedSecret,
              sync_folder: folder,
              status: "active",
              last_error: null,
            },
            { onConflict: "user_id,provider" },
          )
          .select("webdav_url,webdav_username,sync_folder,status,last_synced_at")
          .single();

        if (error) {
          return jsonResponse({ ok: false, message: error.message }, 400);
        }

        return jsonResponse(
          {
            ok: true,
            connection: {
              webdavUrl: data.webdav_url,
              username: data.webdav_username,
              folder: data.sync_folder,
              status: data.status,
              lastSyncedAt: data.last_synced_at,
            },
          },
          200,
        );
      },
    },
  },
});
