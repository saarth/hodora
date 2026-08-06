// Minimal OneDrive client: OAuth (Microsoft identity platform v2.0,
// authorization-code + refresh) plus just enough of the Microsoft Graph API
// to list/upload/download/delete GPX files in one folder. Hand-rolled via
// `fetch`, same discipline as `nextcloud-webdav.server.ts` — no MSAL/Graph
// SDK, which pull in far more than this needs.
//
// Uses the `Files.ReadWrite.AppFolder` scope, not full `Files.ReadWrite`:
// that scope confines the app to its own special "app folder"
// (`/me/drive/special/approot`), invisible to the rest of the user's
// OneDrive — so connecting Hodora never grants it visibility into anything
// else the user stores there. Graph's path-addressing (unlike Drive, which
// is purely ID-based) means files can be reached directly by name under
// that folder, so there's no separate folder-ID cache to maintain.
//
// Load with a dynamic import inside server handlers — this module makes
// outbound requests carrying the user's OAuth tokens and shouldn't end up
// reachable from client-bundled code.

const TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const AUTH_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const GRAPH_API = "https://graph.microsoft.com/v1.0";

const SCOPES =
  "offline_access https://graph.microsoft.com/Files.ReadWrite.AppFolder https://graph.microsoft.com/User.Read";

function requireEnv(name: "ONEDRIVE_CLIENT_ID" | "ONEDRIVE_CLIENT_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name} environment variable. Set it up in the Azure Portal app registration and add it to your server environment (see .env.example).`,
    );
  }
  return value;
}

function encodeItemPath(segments: string[]): string {
  return segments.join("/").split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

/** Path-addresses an item under the app folder, e.g. `itemPath(["Hodora", "abc.gpx"], "/content")` for the content endpoint. */
function itemPath(segments: string[], suffix?: string): string {
  const encoded = encodeItemPath(segments);
  return suffix
    ? `/me/drive/special/approot:/${encoded}:${suffix}`
    : `/me/drive/special/approot:/${encoded}`;
}

function normalizeFolderName(folder: string): string {
  return folder.replace(/^\/+|\/+$/g, "") || "Hodora";
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("ONEDRIVE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: SCOPES,
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type OneDriveTokens = { accessToken: string; refreshToken: string; expiresIn: number };

export async function exchangeCode(code: string, redirectUri: string): Promise<OneDriveTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("ONEDRIVE_CLIENT_ID"),
      client_secret: requireEnv("ONEDRIVE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: SCOPES,
    }),
  });
  if (!response.ok) {
    throw new Error(`Could not complete Microsoft sign-in (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token || !data.refresh_token) {
    throw new Error("Microsoft didn't grant offline access. Try connecting again.");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

/**
 * Refreshes the access token. Microsoft's v2.0 endpoint rotates refresh
 * tokens on (almost) every call — callers must persist the returned
 * `refreshToken` even though a request only asked to refresh the access
 * token, or the old one will eventually stop working.
 */
export async function refreshAccessToken(refreshToken: string): Promise<OneDriveTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("ONEDRIVE_CLIENT_ID"),
      client_secret: requireEnv("ONEDRIVE_CLIENT_SECRET"),
      grant_type: "refresh_token",
      scope: SCOPES,
    }),
  });
  if (!response.ok) {
    throw new Error(
      "Could not refresh the OneDrive connection. Try disconnecting and reconnecting.",
    );
  }
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token || !data.refresh_token) {
    throw new Error(
      "Could not refresh the OneDrive connection. Try disconnecting and reconnecting.",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

/** Returns null rather than throwing — losing the display email isn't worth failing a connect over. */
export async function getAccountEmail(accessToken: string): Promise<string | null> {
  const response = await graphRequest(accessToken, "/me?$select=mail,userPrincipalName", {
    method: "GET",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { mail?: string; userPrincipalName?: string };
  return data.mail ?? data.userPrincipalName ?? null;
}

function graphRequest(accessToken: string, path: string, init: RequestInit): Promise<Response> {
  return fetch(`${GRAPH_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
  });
}

/** Creates the app-folder subfolder named `folder` if it doesn't already exist. Idempotent. */
export async function ensureFolder(accessToken: string, folder: string): Promise<void> {
  const name = normalizeFolderName(folder);
  const getResponse = await graphRequest(accessToken, itemPath([name]), { method: "GET" });
  if (getResponse.ok) return;
  if (getResponse.status !== 404) {
    throw new Error(`Could not look up the OneDrive sync folder (HTTP ${getResponse.status}).`);
  }
  const createResponse = await graphRequest(accessToken, "/me/drive/special/approot/children", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  // A 409 here means another request created it concurrently — fine, it exists either way.
  if (!createResponse.ok && createResponse.status !== 409) {
    throw new Error(`Could not create the OneDrive sync folder (HTTP ${createResponse.status}).`);
  }
}

export type OneDriveFile = {
  id: string;
  name: string;
  etag: string | null;
  lastModified: string | null;
};

/** Lists the `.gpx` children of `folder` (non-recursive). */
export async function listFiles(accessToken: string, folder: string): Promise<OneDriveFile[]> {
  const name = normalizeFolderName(folder);
  const files: OneDriveFile[] = [];
  let url: string | null =
    `${itemPath([name], "/children")}?${new URLSearchParams({ $select: "id,name,eTag,lastModifiedDateTime", $top: "200" }).toString()}`;

  while (url) {
    const response: Response = url.startsWith("http")
      ? await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      : await graphRequest(accessToken, url, { method: "GET" });
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`Could not list the OneDrive sync folder (HTTP ${response.status}).`);
    }
    const data = (await response.json()) as {
      "@odata.nextLink"?: string;
      value?: { id: string; name: string; eTag?: string; lastModifiedDateTime?: string }[];
    };
    for (const f of data.value ?? []) {
      if (!f.name.toLowerCase().endsWith(".gpx")) continue;
      files.push({
        id: f.id,
        name: f.name,
        etag: f.eTag ?? null,
        lastModified: f.lastModifiedDateTime ?? null,
      });
    }
    url = data["@odata.nextLink"] ?? null;
  }
  return files;
}

type UploadResult = { id: string; etag: string | null; lastModified: string | null };

/** Writes `content` to `folder/name`, creating or overwriting as needed — Graph's path-addressed simple upload does both. Files over ~4 MB aren't supported by this simple upload; that covers ordinary GPX tracks but not extremely long multi-day recordings. */
export async function uploadFile(
  accessToken: string,
  folder: string,
  name: string,
  content: string,
): Promise<UploadResult> {
  const path = itemPath([normalizeFolderName(folder), name], "/content");
  const response = await graphRequest(accessToken, path, {
    method: "PUT",
    headers: { "Content-Type": "application/gpx+xml" },
    body: content,
  });
  if (!response.ok) {
    throw new Error(`Upload failed (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as {
    id: string;
    eTag?: string;
    lastModifiedDateTime?: string;
  };
  return { id: data.id, etag: data.eTag ?? null, lastModified: data.lastModifiedDateTime ?? null };
}

export async function downloadFile(accessToken: string, itemId: string): Promise<string> {
  const response = await graphRequest(accessToken, `/me/drive/items/${itemId}/content`, {
    method: "GET",
  });
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}).`);
  return response.text();
}

/** Deletes `itemId`. A 404 (already gone) is treated as success. */
export async function deleteFile(accessToken: string, itemId: string): Promise<void> {
  const response = await graphRequest(accessToken, `/me/drive/items/${itemId}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete failed (HTTP ${response.status}).`);
  }
}

// Exported for tests only.
export const __test__ = { normalizeFolderName, encodeItemPath, itemPath };
