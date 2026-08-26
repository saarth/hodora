import { createFileRoute } from "@tanstack/react-router";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Public, unauthenticated lookup for a shared route. Reads through the
 * service-role client, not RLS — an anonymous visitor has no session for
 * RLS to scope against, and the token itself is the authorization.
 */
export const Route = createFileRoute("/api/share/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: link, error: linkError } = await supabaseAdmin
          .from("shared_links")
          .select(
            "ride_id, wind_hour, wind_speed_ms, wind_direction_deg, temperature_c, weather_code, created_at",
          )
          .eq("token", params.token)
          .maybeSingle();
        if (linkError || !link) {
          return jsonResponse({ error: "Share link not found" }, 404);
        }

        const { data: ride, error: rideError } = await supabaseAdmin
          .from("rides")
          .select("id, name, points, distance_m, ascent_m, descent_m")
          .eq("id", link.ride_id)
          .maybeSingle();
        if (rideError || !ride) {
          return jsonResponse({ error: "Route not found" }, 404);
        }

        return jsonResponse(
          {
            ride: {
              id: ride.id,
              name: ride.name,
              points: ride.points,
              distanceM: ride.distance_m,
              ascentM: ride.ascent_m,
              descentM: ride.descent_m,
            },
            wind: {
              hour: link.wind_hour,
              speedMs: link.wind_speed_ms,
              directionDeg: link.wind_direction_deg,
              temperatureC: link.temperature_c,
              weatherCode: link.weather_code,
            },
            sharedAt: link.created_at,
          },
          200,
        );
      },
    },
  },
});
