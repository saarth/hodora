import { supabase } from "@/integrations/supabase/client";
import { clearOfflineData } from "@/lib/offline-db";

export type ProfileUpdate = {
  display_name?: string | null;
  username?: string;
  unit?: "metric" | "imperial";
};

async function requireUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("You are not signed in");
  return data.user.id;
}

export async function updateProfile(update: ProfileUpdate): Promise<void> {
  const id = await requireUserId();
  if (update.username !== undefined) {
    const username = update.username.trim();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      throw new Error("Username must be 3-24 characters: letters, numbers or underscore");
    }
    const { data: taken, error: lookupError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .neq("id", id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (taken) throw new Error("That username is already taken");
    update.username = username;
  }
  const { error } = await supabase.from("profiles").update(update).eq("id", id);
  if (error) throw error;
}

export async function updateEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email: email.trim() });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function setAccountDeactivated(deactivated: boolean): Promise<void> {
  const id = await requireUserId();
  const { error } = await supabase
    .from("profiles")
    .update({ deactivated_at: deactivated ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function purgeLocalData(): Promise<void> {
  await clearOfflineData();
}
