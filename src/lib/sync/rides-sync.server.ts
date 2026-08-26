// Server-side ride CRUD for the sync engine. Deliberately not a reuse of
// `src/lib/rides.ts` — those functions are hard-wired to the browser
// singleton Supabase client plus guest/IndexedDB branching
// (`isSignedIn()`/`offline-db.ts`) that don't apply server-side. This module
// instead takes a per-request, RLS-scoped client (the one
// `src/lib/api-auth.server.ts`'s `authenticateRequest()` builds from the
// caller's own bearer JWT) — RLS does the user-scoping, so there's no need
// for the service-role client here.
import type { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { RidePoint } from "@/lib/gpx";
import type { Ride } from "@/lib/rides";

type SupabaseClient = ReturnType<typeof createClient<Database>>;

export type RideSyncSummary = { id: string; name: string; updatedAt: string };

export async function listRidesForSync(supabase: SupabaseClient): Promise<RideSyncSummary[]> {
  const { data, error } = await supabase.from("rides").select("id,name,updated_at");
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at }));
}

export async function fetchRideForSync(supabase: SupabaseClient, id: string): Promise<Ride> {
  const { data, error } = await supabase.from("rides").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Ride ${id} not found`);
  return data as unknown as Ride;
}

export type UpsertRideFromSyncInput = {
  /** Present = update this existing ride (a "download" for an already-mapped file). Absent = insert (a "download-new"). */
  id?: string;
  name: string;
  sourceFilename: string | null;
  distanceM: number;
  ascentM: number;
  descentM: number;
  bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number } | null;
  points: RidePoint[];
};

/** Returns the post-write `updatedAt` as the new sync-mapping baseline — never assume a value, the DB trigger always wins. */
export async function upsertRideFromSync(
  supabase: SupabaseClient,
  userId: string,
  input: UpsertRideFromSyncInput,
): Promise<{ id: string; updatedAt: string }> {
  const row = {
    user_id: userId,
    name: input.name,
    source_filename: input.sourceFilename,
    distance_m: Math.round(input.distanceM),
    ascent_m: Math.round(input.ascentM),
    descent_m: Math.round(input.descentM),
    min_lat: input.bounds?.minLat ?? null,
    min_lon: input.bounds?.minLon ?? null,
    max_lat: input.bounds?.maxLat ?? null,
    max_lon: input.bounds?.maxLon ?? null,
    points: input.points as unknown as never,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("rides")
      .update(row)
      .eq("id", input.id)
      .select("id,updated_at")
      .single();
    if (error) throw error;
    return { id: data.id, updatedAt: data.updated_at };
  }

  const { data, error } = await supabase.from("rides").insert(row).select("id,updated_at").single();
  if (error) throw error;
  return { id: data.id, updatedAt: data.updated_at };
}

export async function deleteRideForSync(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("rides").delete().eq("id", id);
  if (error) throw error;
}
