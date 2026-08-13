import { supabase } from "@/integrations/supabase/client";
import type { RidePoint } from "./gpx";
import { isSignedIn } from "./rides";
import {
  deleteOfflineSession,
  getSessionListCache,
  listOfflineSessions,
  putOfflineSession,
  putSessionListCache,
} from "./offline-db";

/** The actual GPS trace recorded during navigation — distinct from a ride's planned `points`. */
export type RideSession = {
  id: string;
  user_id: string;
  ride_id: string | null;
  /** snapshot of the route's name at ride time, so history survives the route being deleted */
  ride_name: string;
  started_at: string;
  ended_at: string;
  distance_m: number;
  ascent_m: number;
  descent_m: number;
  track: RidePoint[];
  created_at: string;
};

export const sessionsKeys = {
  all: ["sessions"] as const,
};

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export async function fetchRideSessions(): Promise<RideSession[]> {
  if (!(await isSignedIn())) return listOfflineSessions();
  if (isOffline()) {
    const cached = await getSessionListCache();
    if (cached) return cached;
  }
  try {
    const { data, error } = await supabase
      .from("ride_sessions")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const sessions = (data ?? []) as unknown as RideSession[];
    void putSessionListCache(sessions);
    return sessions;
  } catch (error) {
    const cached = await getSessionListCache();
    if (cached) return cached;
    throw error;
  }
}

/** Records a finished (or abandoned mid-way) navigation as a session. Best-effort — a failed save shouldn't block leaving the nav page. */
export async function saveRideSession(input: {
  rideId: string;
  rideName: string;
  startedAt: string;
  endedAt: string;
  distanceM: number;
  ascentM: number;
  descentM: number;
  track: RidePoint[];
}): Promise<void> {
  if (!(await isSignedIn())) {
    await putOfflineSession({
      id: crypto.randomUUID(),
      user_id: "guest",
      ride_id: input.rideId,
      ride_name: input.rideName,
      started_at: input.startedAt,
      ended_at: input.endedAt,
      distance_m: Math.round(input.distanceM),
      ascent_m: Math.round(input.ascentM),
      descent_m: Math.round(input.descentM),
      track: input.track,
      created_at: new Date().toISOString(),
    });
    return;
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { error } = await supabase.from("ride_sessions").insert({
    user_id: auth.user.id,
    ride_id: input.rideId,
    ride_name: input.rideName,
    started_at: input.startedAt,
    ended_at: input.endedAt,
    distance_m: Math.round(input.distanceM),
    ascent_m: Math.round(input.ascentM),
    descent_m: Math.round(input.descentM),
    track: input.track as unknown as never,
  });
  if (error) throw error;
}

export async function deleteRideSession(id: string): Promise<void> {
  if (!(await isSignedIn())) {
    await deleteOfflineSession(id);
    return;
  }
  const { error } = await supabase.from("ride_sessions").delete().eq("id", id);
  if (error) throw error;
  await deleteOfflineSession(id);
}
