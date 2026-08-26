// Minimal Google Drive client: OAuth (authorization-code + refresh) plus
// just enough of the Drive API v3 to list/upload/download/delete GPX files
// in one folder. Hand-rolled via `fetch`, same discipline as
// `nextcloud-webdav.server.ts` — no `googleapis` SDK, which is Node-only and
// far bigger than this needs.
//
// Uses the `drive.file` scope, not full `drive` access: that scope only
// lets the app see files *it* created (plus anything the user explicitly
// picks via a file picker, which this app never shows) — so connecting
// Hodora never grants it visibility into the rest of a user's Drive.
//
// Load with a dynamic import inside server handlers — this module makes
// outbound requests carrying the user's OAuth tokens and shouldn't end up
// reachable from client-bundled code.
import { MAX_GPX_DOWNLOAD_BYTES, readTextCapped } from "./http.server";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

const SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";

function requireEnv(name: "GOOGLE_DRIVE_CLIENT_ID" | "GOOGLE_DRIVE_CLIENT_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name} environment variable. Set it up in the Google Cloud Console and add it to your server environment (see .env.example).`,
    );
  }
  return value;
}

/** Escapes a value for use inside a single-quoted Drive `q` string literal. */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_DRIVE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type GoogleDriveTokens = { accessToken: string; refreshToken: string; expiresIn: number };

/** Exchanges an authorization code for tokens. Throws if Google didn't grant a refresh token (e.g. the app isn't configured for offline access). */
export async function exchangeCode(code: string, redirectUri: string): Promise<GoogleDriveTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_DRIVE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_DRIVE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new Error(`Could not complete Google sign-in (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token || !data.refresh_token) {
    throw new Error(
      "Google didn't grant offline access. Remove Hodora from your Google account's third-party access settings and try connecting again.",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("GOOGLE_DRIVE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_DRIVE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(
      "Could not refresh the Google Drive connection. Try disconnecting and reconnecting.",
    );
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error(
      "Could not refresh the Google Drive connection. Try disconnecting and reconnecting.",
    );
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 };
}

/** Returns null rather than throwing — losing the display email isn't worth failing a connect over. */
export async function getAccountEmail(accessToken: string): Promise<string | null> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { email?: string };
  return typeof data.email === "string" ? data.email : null;
}

function driveRequest(accessToken: string, path: string, init: RequestInit): Promise<Response> {
  return fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
  });
}

/**
 * Resolves the sync folder's file ID, preferring `existingFolderId` (a
 * cached ID from a previous sync) when it still exists and isn't trashed.
 * Falls back to finding-or-creating a root-level folder named `folderName`.
 */
export async function ensureFolder(
  accessToken: string,
  folderName: string,
  existingFolderId: string | null,
): Promise<string> {
  if (existingFolderId) {
    const response = await driveRequest(
      accessToken,
      `/files/${existingFolderId}?fields=id,trashed`,
      {
        method: "GET",
      },
    );
    if (response.ok) {
      const data = (await response.json()) as { trashed?: boolean };
      if (!data.trashed) return existingFolderId;
    }
  }

  const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${escapeQueryValue(folderName)}' and 'root' in parents and trashed = false`;
  const searchResponse = await driveRequest(
    accessToken,
    `/files?${new URLSearchParams({ q, fields: "files(id)", spaces: "drive" }).toString()}`,
    { method: "GET" },
  );
  if (!searchResponse.ok) {
    throw new Error(`Could not look up the Drive sync folder (HTTP ${searchResponse.status}).`);
  }
  const searchData = (await searchResponse.json()) as { files?: { id: string }[] };
  const found = searchData.files?.[0]?.id;
  if (found) return found;

  const createResponse = await driveRequest(accessToken, "/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
    }),
  });
  if (!createResponse.ok) {
    throw new Error(`Could not create the Drive sync folder (HTTP ${createResponse.status}).`);
  }
  const createData = (await createResponse.json()) as { id: string };
  return createData.id;
}

export type DriveFile = {
  id: string;
  name: string;
  etag: string | null;
  lastModified: string | null;
};

/** Lists the `.gpx` children of `folderId` (non-recursive). */
export async function listFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const q = `'${escapeQueryValue(folderId)}' in parents and trashed = false`;
    const params = new URLSearchParams({
      q,
      fields: "nextPageToken,files(id,name,modifiedTime,md5Checksum)",
      spaces: "drive",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await driveRequest(accessToken, `/files?${params.toString()}`, {
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`Could not list the Drive sync folder (HTTP ${response.status}).`);
    }
    const data = (await response.json()) as {
      nextPageToken?: string;
      files?: { id: string; name: string; modifiedTime?: string; md5Checksum?: string }[];
    };
    for (const f of data.files ?? []) {
      if (!f.name.toLowerCase().endsWith(".gpx")) continue;
      files.push({
        id: f.id,
        name: f.name,
        etag: f.md5Checksum ?? null,
        lastModified: f.modifiedTime ?? null,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

type UploadResult = { id: string; etag: string | null; lastModified: string | null };

/** Overwrites `existingId`'s content, or creates a new file named `name` under `folderId` when `existingId` is null. */
export async function uploadFile(
  accessToken: string,
  folderId: string,
  name: string,
  existingId: string | null,
  content: string,
): Promise<UploadResult> {
  const fields = "id,modifiedTime,md5Checksum";

  if (existingId) {
    const response = await fetch(
      `${DRIVE_UPLOAD_API}/${existingId}?${new URLSearchParams({ uploadType: "media", fields }).toString()}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/gpx+xml" },
        body: content,
      },
    );
    if (!response.ok) throw new Error(`Upload failed (HTTP ${response.status}).`);
    const data = (await response.json()) as {
      id: string;
      modifiedTime?: string;
      md5Checksum?: string;
    };
    return { id: data.id, etag: data.md5Checksum ?? null, lastModified: data.modifiedTime ?? null };
  }

  const boundary = `hodora-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name, parents: [folderId] });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/gpx+xml\r\n\r\n${content}\r\n` +
    `--${boundary}--`;
  const response = await fetch(
    `${DRIVE_UPLOAD_API}?${new URLSearchParams({ uploadType: "multipart", fields }).toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!response.ok) throw new Error(`Upload failed (HTTP ${response.status}).`);
  const data = (await response.json()) as {
    id: string;
    modifiedTime?: string;
    md5Checksum?: string;
  };
  return { id: data.id, etag: data.md5Checksum ?? null, lastModified: data.modifiedTime ?? null };
}

export async function downloadFile(accessToken: string, fileId: string): Promise<string> {
  const response = await driveRequest(accessToken, `/files/${fileId}?alt=media`, { method: "GET" });
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}).`);
  return readTextCapped(response, MAX_GPX_DOWNLOAD_BYTES);
}

/** Deletes `fileId`. A 404 (already gone) is treated as success. */
export async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const response = await driveRequest(accessToken, `/files/${fileId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete failed (HTTP ${response.status}).`);
  }
}

// Exported for tests only.
export const __test__ = { escapeQueryValue };
