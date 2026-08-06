import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/api-auth.server";

/**
 * Authenticated API endpoint for permanent account deletion.
 * This is a plain HTTP route so it can be called from the PWA shell too.
 */
export const Route = createFileRoute("/api/delete-account")({
  server: {
    handlers: {
      POST: async () => {
        const { userId } = await authenticateRequest();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { error: connectionsError } = await supabaseAdmin
          .from("cloud_connections")
          .delete()
          .eq("user_id", userId);
        if (connectionsError) throw new Error(connectionsError.message);

        const { error: ridesError } = await supabaseAdmin
          .from("rides")
          .delete()
          .eq("user_id", userId);
        if (ridesError) throw new Error(ridesError.message);

        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .delete()
          .eq("id", userId);
        if (profileError) throw new Error(profileError.message);

        const { error: userError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (userError) throw new Error(userError.message);

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
