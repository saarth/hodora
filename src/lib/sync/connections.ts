// Thin client-side wrappers around the `/api/cloud/nextcloud/*` routes —
// same bearer-token-attaching pattern `settings.tsx`'s account-deletion
// mutation already uses, since none of this goes through a serverFn.
import { supabase } from "@/integrations/supabase/client";
import { isSignedIn } from "@/lib/rides";
import type { SyncSummary } from "@/lib/sync/nextcloud-engine.server";

export type NextcloudStatus =
  | { connected: false }
  | {
      connected: true;
      webdavUrl: string;
      username: string;
      folder: string;
      status: "active" | "error" | "disconnected";
      lastError: string | null;
      lastSyncedAt: string | null;
      syncing: boolean;
    };

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error("You must be signed in to do that.");
  }
  return fetch(`${window.location.origin}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

export async function fetchNextcloudStatus(): Promise<NextcloudStatus> {
  const response = await authedFetch("/api/cloud/nextcloud/status");
  if (!response.ok) {
    throw new Error("Could not check the Nextcloud connection.");
  }
  return response.json();
}

export async function connectNextcloud(input: {
  url: string;
  username: string;
  appPassword: string;
  folder?: string;
}): Promise<void> {
  const response = await authedFetch("/api/cloud/nextcloud/connect", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as {
    ok: boolean;
    message?: string;
  } | null;
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message || "Could not connect to Nextcloud.");
  }
}

export async function disconnectNextcloud(): Promise<void> {
  const response = await authedFetch("/api/cloud/nextcloud/disconnect", { method: "POST" });
  if (!response.ok) {
    throw new Error("Could not disconnect Nextcloud.");
  }
}

export async function syncNextcloudNow(): Promise<SyncSummary> {
  const response = await authedFetch("/api/cloud/nextcloud/sync", { method: "POST" });
  const body = (await response.json().catch(() => null)) as
    { ok: true; summary: SyncSummary; hasMore: boolean } | { ok: false; message?: string } | null;
  if (!response.ok || !body?.ok) {
    throw new Error((body && "message" in body && body.message) || "Sync failed.");
  }
  return body.summary;
}

/**
 * Best-effort sync trigger for app-open/import/delete moments. Silently
 * no-ops for guests, when Nextcloud isn't connected, or when a sync is
 * already in flight (409) — this is a background nicety, not a user action,
 * so it never surfaces an error toast on its own.
 */
export async function triggerCloudSyncIfConnected(): Promise<void> {
  try {
    if (!(await isSignedIn())) return;
    const status = await fetchNextcloudStatus();
    if (!status.connected || status.syncing) return;
    await syncNextcloudNow();
  } catch {
    // best effort — the manual "Sync now" button surfaces real errors
  }
}
