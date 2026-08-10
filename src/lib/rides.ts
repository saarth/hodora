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
  created_at: string;
  updated_at: string;
};

export type RideSummary = Omit<Ride, "points">;

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  unit: "metric" | "imperial";
  deactivated_at?: string | null;
};

const SUMMARY_COLUMNS =
  "id,user_id,name,description,source_filename,distance_m,ascent_m,descent_m,min_lat,min_lon,max_lat,max_lon,created_at,updated_at";

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
  const { points: _points, ...summary } = ride;
  return summary;
}

async function localRides(): Promise<RideSummary[]> {
  const rides = await listOfflineRides();
  return rides
    .map(toSummary)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
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
    const { data, error } = await supabase
      .from("rides")
      .select("*")
      .eq("id", id)
      .maybeSingle();
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
  const { error } = await supabase
    .from("profiles")
    .update({ unit })
    .eq("id", auth.user.id);
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
