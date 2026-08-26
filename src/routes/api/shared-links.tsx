import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { authenticateRequest } from "@/lib/api-auth.server";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Mints a public share token for one of the caller's own rides. `rides`
 * RLS already restricts the ownership lookup below to rows the caller can
 * see, so a rideId belonging to someone else simply fails to be found —
 * this is the check that keeps `shared_links` from being mintable for a
 * ride the caller doesn't own, since the table's own FK has no ownership
 * constraint of its own.
 */
export const Route = createFileRoute("/api/shared-links")({
  server: {
    handlers: {
      POST: async () => {
        const { userId, supabase } = await authenticateRequest();

        const request = getRequest();
        const body = (await request.json().catch(() => null)) as {
          rideId?: string;
          windHour?: string;
          windSpeedMs?: number;
          windDirectionDeg?: number;
          temperatureC?: number;
          weatherCode?: number;
        } | null;

        const rideId = body?.rideId?.trim();
        if (!rideId) {
          return jsonResponse({ error: "rideId is required" }, 400);
        }

        const { data: ride, error: rideError } = await supabase
          .from("rides")
          .select("id")
          .eq("id", rideId)
          .maybeSingle();
        if (rideError || !ride) {
          return jsonResponse({ error: "Route not found" }, 404);
        }

        const token = crypto.randomUUID().replace(/-/g, "");
        const { error } = await supabase.from("shared_links").insert({
          ride_id: rideId,
          user_id: userId,
          token,
          wind_hour: body?.windHour?.trim() || null,
          wind_speed_ms: body?.windSpeedMs ?? null,
          wind_direction_deg: body?.windDirectionDeg ?? null,
          temperature_c: body?.temperatureC ?? null,
          weather_code: body?.weatherCode ?? null,
        });
        if (error) {
          return jsonResponse({ error: error.message }, 400);
        }

        return jsonResponse({ token }, 200);
      },
    },
  },
});
