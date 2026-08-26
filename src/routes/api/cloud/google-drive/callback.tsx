import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";

function redirectToSettings(
  origin: string,
  outcome: "connected" | "error",
  detail?: string,
): Response {
  const dest = new URL("/settings", origin);
  if (outcome === "connected") dest.searchParams.set("connected", "google_drive");
  else dest.searchParams.set("cloud_error", detail ? `google_drive:${detail}` : "google_drive");
  return Response.redirect(dest.toString(), 302);
}

/**
 * Lands here as a plain browser redirect from Google — no Authorization
 * header available, so the signed `state` param (see `oauth-state.server.ts`)
 * is what proves which Hodora user this is for, and the service-role client
 * (not the per-request RLS one `authenticateRequest()` builds) is what
 * writes the connection row.
 */
export const Route = createFileRoute("/api/cloud/google-drive/callback")({
  server: {
    handlers: {
      GET: async () => {
        const request = getRequest();
        const url = new URL(request.url);
        const origin = url.origin;
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (url.searchParams.get("error") || !code || !state) {
          return redirectToSettings(origin, "error", "denied");
        }

        const { verifyOAuthState } = await import("@/lib/sync/oauth-state.server");
        const verified = await verifyOAuthState(state);
        if (!verified) return redirectToSettings(origin, "error", "expired");

        try {
          const drive = await import("@/lib/sync/google-drive.server");
          const redirectUri = `${origin}/api/cloud/google-drive/callback`;
          const tokens = await drive.exchangeCode(code, redirectUri);
          const [accountEmail, folderId] = await Promise.all([
            drive.getAccountEmail(tokens.accessToken),
            drive.ensureFolder(tokens.accessToken, verified.folder, null),
          ]);

          const { encryptSecret } = await import("@/lib/sync/token-crypto.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { error } = await supabaseAdmin.from("cloud_connections").upsert(
            {
              user_id: verified.userId,
              provider: "google_drive",
              encrypted_secret: await encryptSecret(tokens.refreshToken),
              sync_folder: verified.folder,
              remote_folder_id: folderId,
              account_email: accountEmail,
              status: "active",
              last_error: null,
            },
            { onConflict: "user_id,provider" },
          );
          if (error) return redirectToSettings(origin, "error", "save-failed");

          return redirectToSettings(origin, "connected");
        } catch {
          return redirectToSettings(origin, "error", "connect-failed");
        }
      },
    },
  },
});
