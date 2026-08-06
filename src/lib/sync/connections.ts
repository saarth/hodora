// Thin client-side wrappers around the `/api/cloud/*` routes — same
// bearer-token-attaching pattern `settings.tsx`'s account-deletion mutation
// already uses, since none of this goes through a serverFn.
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

export type OAuthCloudStatus =
  | { connected: false }
  | {
      connected: true;
      accountEmail: string | null;
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

/** Shared client for the two OAuth-based providers (Google Drive, OneDrive) — same shape, different URL prefix. */
export type OAuthProvider = "google-drive" | "onedrive";

export async function fetchOAuthCloudStatus(provider: OAuthProvider): Promise<OAuthCloudStatus> {
  const response = await authedFetch(`/api/cloud/${provider}/status`);
  if (!response.ok) {
    throw new Error(
      `Could not check the ${provider === "google-drive" ? "Google Drive" : "OneDrive"} connection.`,
    );
  }
  return response.json();
}

/**
 * Starts the OAuth flow: fetches the provider's consent URL, then does a
 * full-page navigation to it (it can't be `fetch`ed — the provider needs to
 * see a real top-level browser navigation to show its consent screen and
 * redirect back to `/api/cloud/<provider>/callback`).
 */
export async function beginOAuthConnect(provider: OAuthProvider, folder: string): Promise<void> {
  const response = await authedFetch(`/api/cloud/${provider}/authorize`, {
    method: "POST",
    body: JSON.stringify({ folder }),
  });
  const body = (await response.json().catch(() => null)) as {
    ok: boolean;
    url?: string;
    message?: string;
  } | null;
  if (!response.ok || !body?.ok || !body.url) {
    throw new Error(body?.message || "Could not start sign-in.");
  }
  window.location.href = body.url;
}

export async function disconnectOAuthCloud(provider: OAuthProvider): Promise<void> {
  const response = await authedFetch(`/api/cloud/${provider}/disconnect`, { method: "POST" });
  if (!response.ok) {
    throw new Error("Could not disconnect.");
  }
}

export async function syncOAuthCloudNow(provider: OAuthProvider): Promise<SyncSummary> {
  const response = await authedFetch(`/api/cloud/${provider}/sync`, { method: "POST" });
  const body = (await response.json().catch(() => null)) as
    { ok: true; summary: SyncSummary; hasMore: boolean } | { ok: false; message?: string } | null;
  if (!response.ok || !body?.ok) {
    throw new Error((body && "message" in body && body.message) || "Sync failed.");
  }
  return body.summary;
}

/**
 * Best-effort sync trigger for app-open/import/delete moments. Silently
 * no-ops for guests or when nothing's connected — this is a background
 * nicety, not a user action, so it never surfaces an error toast on its own.
 * Runs whichever connections exist in parallel; each is independent.
 */
export async function triggerCloudSyncIfConnected(): Promise<void> {
  if (!(await isSignedIn())) return;

  const attempt = async (
    fetchStatus: () => Promise<{ connected: boolean; syncing?: boolean }>,
    sync: () => Promise<unknown>,
  ) => {
    try {
      const status = await fetchStatus();
      if (!status.connected || status.syncing) return;
      await sync();
    } catch {
      // best effort — the manual "Sync now" button surfaces real errors
    }
  };

  await Promise.all([
    attempt(fetchNextcloudStatus, syncNextcloudNow),
    attempt(
      () => fetchOAuthCloudStatus("google-drive"),
      () => syncOAuthCloudNow("google-drive"),
    ),
    attempt(
      () => fetchOAuthCloudStatus("onedrive"),
      () => syncOAuthCloudNow("onedrive"),
    ),
  ]);
}
