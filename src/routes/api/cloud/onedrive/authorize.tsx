import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { authenticateRequest } from "@/lib/api-auth.server";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeFolder(folder: string | undefined): string {
  return folder?.trim().replace(/^\/+|\/+$/g, "") || "Hodora";
}

/** Returns the Microsoft OAuth consent URL for the caller to navigate the browser to (can't be `fetch`ed cross-origin). */
export const Route = createFileRoute("/api/cloud/onedrive/authorize")({
  server: {
    handlers: {
      POST: async () => {
        const { userId } = await authenticateRequest();

        const request = getRequest();
        const body = (await request.json().catch(() => null)) as { folder?: string } | null;
        const folder = normalizeFolder(body?.folder);

        try {
          const { createOAuthState } = await import("@/lib/sync/oauth-state.server");
          const { buildAuthUrl } = await import("@/lib/sync/onedrive.server");

          const redirectUri = `${new URL(request.url).origin}/api/cloud/onedrive/callback`;
          const state = await createOAuthState({ userId, folder });
          return jsonResponse({ ok: true, url: buildAuthUrl(redirectUri, state) }, 200);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not start Microsoft sign-in.";
          return jsonResponse({ ok: false, message }, 500);
        }
      },
    },
  },
});
