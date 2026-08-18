import { supabase } from "@/integrations/supabase/client";
import type { RidePoint } from "./gpx";
import {
  deleteOfflineRide,
  getCachedProfile,
  getOfflineRide,
  getRideList,
  listOfflineRides,
  putCachedProfile,
  putOfflineRide,
  putRideList,
} from "./offline-db";

export type RideDifficulty = "easy" | "moderate" | "hard" | "extreme";
export type RideSurface = "paved" | "gravel" | "mixed" | "unpaved";

export type RideNote = {
  id: string;
  /** cumulative route distance in meters where the note sits */
  distanceM: number;
  lat: number;
  lon: number;
  text: string;
  createdAt: string;
};

export type Ride = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source_filename: string | null;
  distance_m: number;
  ascent_m: number;
  descent_m: number;
  min_lat: number | null;
  min_lon: number | null;
  max_lat: number | null;
  max_lon: number | null;
  points: RidePoint[];
  difficulty: RideDifficulty | null;
  surface: RideSurface | null;
  notes: RideNote[];
  created_at: string;
  updated_at: string;
};

export type RideSummary = Omit<Ride, "points" | "notes">;

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  unit: "metric" | "imperial";
  deactivated_at?: string | null;
};

const SUMMARY_COLUMNS =
  "id,user_id,name,description,source_filename,distance_m,ascent_m,descent_m,min_lat,min_lon,max_lat,max_lon,difficulty,surface,created_at,updated_at";

export const ridesKeys = {
  all: ["rides"] as const,
  detail: (id: string) => ["rides", id] as const,
  profile: ["profile"] as const,
};

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Signing in is optional: guests keep every route locally on the device. */
export async function isSignedIn(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  } catch {
    return false;
  }
}

function toSummary(ride: Ride): RideSummary {
  const { points: _points, notes: _notes, ...summary } = ride;
  return summary;
}

async function localRides(): Promise<RideSummary[]> {
  const rides = await listOfflineRides();
  return rides.map(toSummary).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function fetchRides(): Promise<RideSummary[]> {
  if (!(await isSignedIn())) return localRides();
  if (isOffline()) {
    const cached = await getRideList();
    if (cached) return cached;
  }
  try {
    const { data, error } = await supabase
      .from("rides")
      .select(SUMMARY_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rides = (data ?? []) as unknown as RideSummary[];
    void putRideList(rides);
    return rides;
  } catch (error) {
    const cached = await getRideList();
    if (cached) return cached;
    throw error;
  }
}

export async function fetchRide(id: string): Promise<Ride> {
  if (!(await isSignedIn())) {
    const saved = await getOfflineRide(id);
    if (!saved) throw new Error("Ride not found");
    return saved;
  }
  if (isOffline()) {
    const saved = await getOfflineRide(id);
    if (saved) return saved;
  }
  try {
    const { data, error } = await supabase.from("rides").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Ride not found");
    return data as unknown as Ride;
  } catch (error) {
    const saved = await getOfflineRide(id);
    if (saved) return saved;
    throw error;
  }
}

export async function deleteRide(id: string): Promise<void> {
  if (!(await isSignedIn())) {
    await deleteOfflineRide(id);
    return;
  }
  const { error } = await supabase.from("rides").delete().eq("id", id);
  if (error) throw error;
  await deleteOfflineRide(id);
}

export async function renameRide(id: string, name: string): Promise<void> {
  if (!(await isSignedIn())) {
    const saved = await getOfflineRide(id);
    if (saved) await putOfflineRide({ ...saved, name });
    return;
  }
  const { error } = await supabase.from("rides").update({ name }).eq("id", id);
  if (error) throw error;
}

/** Sets a route's difficulty/surface tags. `undefined` leaves a field unchanged, `null` clears it. */
export async function updateRideTags(
  id: string,
  tags: { difficulty?: RideDifficulty | null; surface?: RideSurface | null },
): Promise<void> {
  if (!(await isSignedIn())) {
    const saved = await getOfflineRide(id);
    if (saved) await putOfflineRide({ ...saved, ...tags });
    return;
  }
  const { error } = await supabase.from("rides").update(tags).eq("id", id);
  if (error) throw error;
}

/** Replaces a route's full notes list — the caller already has `ride.notes` loaded to add/edit/remove from. */
export async function updateRideNotes(id: string, notes: RideNote[]): Promise<void> {
  if (!(await isSignedIn())) {
    const saved = await getOfflineRide(id);
    if (saved) await putOfflineRide({ ...saved, notes });
    return;
  }
  const { error } = await supabase
    .from("rides")
    .update({ notes: notes as unknown as never })
    .eq("id", id);
  if (error) throw error;
}

export async function fetchProfile(): Promise<Profile | null> {
  if (!(await isSignedIn())) return null;
  if (isOffline()) {
    const cached = await getCachedProfile();
    if (cached) return cached;
  }
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("id,username,display_name,avatar_url,unit,deactivated_at")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (error) throw error;
    const profile = (data as unknown as Profile) ?? null;
    void putCachedProfile(profile);
    return profile;
  } catch (error) {
    const cached = await getCachedProfile();
    if (cached) return cached;
    throw error;
  }
}

export async function updateUnit(unit: "metric" | "imperial"): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { error } = await supabase.from("profiles").update({ unit }).eq("id", auth.user.id);
  if (error) throw error;
}

export async function createRide(input: {
  name: string;
  sourceFilename: string | null;
  distanceM: number;
  ascentM: number;
  descentM: number;
  bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number } | null;
  points: RidePoint[];
}): Promise<string> {
  if (input.points.length < 2) {
    throw new Error("A route needs at least two points.");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    // Guest: keep the route on the device only.
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await putOfflineRide({
      id,
      user_id: "guest",
      name: input.name,
      description: null,
      source_filename: input.sourceFilename,
      distance_m: Math.round(input.distanceM),
      ascent_m: Math.round(input.ascentM),
      descent_m: Math.round(input.descentM),
      min_lat: input.bounds?.minLat ?? null,
      min_lon: input.bounds?.minLon ?? null,
      max_lat: input.bounds?.maxLat ?? null,
      max_lon: input.bounds?.maxLon ?? null,
      points: input.points,
      difficulty: null,
      surface: null,
      notes: [],
      created_at: now,
      updated_at: now,
    });
    return id;
  }
  const { data, error } = await supabase
    .from("rides")
    .insert({
      user_id: auth.user.id,
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
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Mints a public `/share/:token` link for one of the caller's own rides,
 * snapshotting the wind sample shown at share time. Same bearer-token
 * pattern as the cloud-sync client wrappers in `sync/connections.ts`, since
 * this goes through a plain `/api/*` route rather than a server function.
 */
export async function createSharedLink(input: {
  rideId: string;
  windHour?: string | null;
  windSpeedMs?: number;
  windDirectionDeg?: number;
  temperatureC?: number;
  weatherCode?: number;
}): Promise<string> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error("You must be signed in to share a route.");
  }
  const response = await fetch(`${window.location.origin}/api/shared-links`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rideId: input.rideId,
      windHour: input.windHour ?? null,
      windSpeedMs: input.windSpeedMs,
      windDirectionDeg: input.windDirectionDeg,
      temperatureC: input.temperatureC,
      weatherCode: input.weatherCode,
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    token?: string;
    error?: string;
  } | null;
  if (!response.ok || !body?.token) {
    throw new Error(body?.error || "Could not create a share link.");
  }
  return body.token;
}
