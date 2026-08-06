import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";

function redirectToSettings(
  origin: string,
  outcome: "connected" | "error",
  detail?: string,
): Response {
  const dest = new URL("/settings", origin);
  if (outcome === "connected") dest.searchParams.set("connected", "onedrive");
  else dest.searchParams.set("cloud_error", detail ? `onedrive:${detail}` : "onedrive");
  return Response.redirect(dest.toString(), 302);
}

/**
 * Lands here as a plain browser redirect from Microsoft — no Authorization
 * header available, so the signed `state` param (see `oauth-state.server.ts`)
 * is what proves which Hodora user this is for, and the service-role client
 * (not the per-request RLS one `authenticateRequest()` builds) is what
 * writes the connection row.
 */
export const Route = createFileRoute("/api/cloud/onedrive/callback")({
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
          const onedrive = await import("@/lib/sync/onedrive.server");
          const redirectUri = `${origin}/api/cloud/onedrive/callback`;
          const tokens = await onedrive.exchangeCode(code, redirectUri);
          const [accountEmail] = await Promise.all([
            onedrive.getAccountEmail(tokens.accessToken),
            onedrive.ensureFolder(tokens.accessToken, verified.folder),
          ]);

          const { encryptSecret } = await import("@/lib/sync/token-crypto.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { error } = await supabaseAdmin.from("cloud_connections").upsert(
            {
              user_id: verified.userId,
              provider: "onedrive",
              encrypted_secret: await encryptSecret(tokens.refreshToken),
              sync_folder: verified.folder,
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
