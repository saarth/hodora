import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/api-auth.server";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Removes the connection row (cascades ride_sync_state). Touches neither local rides nor remote files. */
export const Route = createFileRoute("/api/cloud/onedrive/disconnect")({
  server: {
    handlers: {
      POST: async () => {
        const { userId, supabase } = await authenticateRequest();

        const { error } = await supabase
          .from("cloud_connections")
          .delete()
          .eq("user_id", userId)
          .eq("provider", "onedrive");

        if (error) {
          return jsonResponse({ ok: false, message: error.message }, 400);
        }
        return jsonResponse({ ok: true }, 200);
      },
    },
  },
});
