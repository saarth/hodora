import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createSupabaseFetch } from "@/integrations/supabase/fetch";

async function authenticateRequest(): Promise<{ userId: string; supabase: ReturnType<typeof createClient<Database>> }> {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase environment variables");
  }

  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }
  const token = authHeader.replace("Bearer ", "");
  if (!token || token.split(".").length !== 3) {
    throw new Error("Unauthorized");
  }

  const supabase = createClient<Database>(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    },
  );

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Error("Unauthorized");
  }

  return { userId: data.claims.sub, supabase };
}

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
