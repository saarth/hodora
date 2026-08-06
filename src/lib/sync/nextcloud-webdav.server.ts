// Minimal Nextcloud WebDAV client: just enough to list/upload/download/delete
// GPX files in one folder. Hand-rolled HTTP verbs via `fetch` (PROPFIND/
// MKCOL/PUT/GET/DELETE all work identically in the Cloudflare Workers
// runtime and Node — no dedicated WebDAV library needed for the transport),
// but multistatus XML responses are parsed with `fast-xml-parser` rather
// than regexed — namespace-prefix variance across Nextcloud versions and
// reverse proxies (`d:`, `D:`, `oc:`) makes hand-parsing that fragile.
//
// Load with a dynamic import inside server handlers — this module makes
// outbound requests carrying the user's WebDAV credentials and shouldn't end
// up reachable from client-bundled code.
import { XMLParser } from "fast-xml-parser";

export type NextcloudConnParams = {
  url: string;
  username: string;
  password: string;
};

export type WebdavFile = {
  path: string;
  etag: string | null;
  lastModified: string | null;
  size: number;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function basicAuthHeader(username: string, password: string): string {
  const encoded = bytesToBase64(new TextEncoder().encode(`${username}:${password}`));
  return `Basic ${encoded}`;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function normalizeFolder(folder: string): string {
  const trimmed = folder.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `/${trimmed}` : "";
}

function buildDavUrl(conn: NextcloudConnParams, path: string): string {
  const base = normalizeBaseUrl(conn.url);
  const encodedUser = encodeURIComponent(conn.username);
  const encodedPath = path
    .split("/")
    .map((segment) => (segment ? encodeURIComponent(segment) : segment))
    .join("/");
  return `${base}/remote.php/dav/files/${encodedUser}${encodedPath}`;
}

function davRequest(conn: NextcloudConnParams, path: string, init: RequestInit): Promise<Response> {
  return fetch(buildDavUrl(conn, path), {
    ...init,
    headers: {
      Authorization: basicAuthHeader(conn.username, conn.password),
      ...init.headers,
    },
  });
}

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true,
});

/** Validates a connection's credentials/URL with a Depth:0 PROPFIND against the DAV root. */
export async function testConnection(
  conn: NextcloudConnParams,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await davRequest(conn, "/", {
      method: "PROPFIND",
      headers: { Depth: "0" },
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: "Check your username and app password." };
    }
    if (!response.ok && response.status !== 207) {
      return {
        ok: false,
        message: `Server responded with ${response.status}. Check the server URL.`,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not reach that server. Check the server URL." };
  }
}

/** Creates `folder` if it doesn't already exist. Idempotent. */
export async function ensureFolder(conn: NextcloudConnParams, folder: string): Promise<void> {
  const response = await davRequest(conn, normalizeFolder(folder), { method: "MKCOL" });
  if (response.status === 201 || response.status === 405) return;
  throw new Error(`Could not create sync folder (HTTP ${response.status}).`);
}

type MultistatusResponse = {
  href?: string;
  propstat?:
    | { prop?: Record<string, unknown>; status?: string }
    | { prop?: Record<string, unknown>; status?: string }[];
};

function pickOkPropstat(
  propstat: MultistatusResponse["propstat"],
): { prop?: Record<string, unknown>; status?: string } | undefined {
  const list = Array.isArray(propstat) ? propstat : propstat ? [propstat] : [];
  return list.find((p) => p.status?.includes("200")) ?? list[0];
}

function textOf(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") return null; // e.g. an empty self-closing tag parses to {}
  return String(value);
}

/** Lists the immediate `.gpx` children of `folder`. */
export async function listFolder(conn: NextcloudConnParams, folder: string): Promise<WebdavFile[]> {
  const response = await davRequest(conn, normalizeFolder(folder), {
    method: "PROPFIND",
    headers: { Depth: "1" },
  });
  if (response.status === 404) return [];
  if (!response.ok && response.status !== 207) {
    throw new Error(`Could not list the sync folder (HTTP ${response.status}).`);
  }

  const body = await response.text();
  const parsed = xmlParser.parse(body) as {
    multistatus?: { response?: MultistatusResponse | MultistatusResponse[] };
  };
  const responses = parsed.multistatus?.response;
  const list = Array.isArray(responses) ? responses : responses ? [responses] : [];

  const files: WebdavFile[] = [];
  for (const entry of list) {
    const href = entry.href;
    if (!href || !href.toLowerCase().endsWith(".gpx")) continue;
    const prop = pickOkPropstat(entry.propstat)?.prop ?? {};
    const decodedHref = decodeURIComponent(href);
    const folderPrefix = `/remote.php/dav/files/${conn.username}`;
    const relative = decodedHref.startsWith(folderPrefix)
      ? decodedHref.slice(folderPrefix.length)
      : decodedHref;
    files.push({
      path: relative.startsWith("/") ? relative : `/${relative}`,
      etag: textOf(prop.getetag),
      lastModified: textOf(prop.getlastmodified),
      size: Number(prop.getcontentlength) || 0,
    });
  }
  return files;
}

/** Uploads `content` to `path`, returning the resulting etag/last-modified when the server reports them. */
export async function uploadFile(
  conn: NextcloudConnParams,
  path: string,
  content: string,
): Promise<{ etag: string | null; lastModified: string | null }> {
  const response = await davRequest(conn, path, {
    method: "PUT",
    headers: { "Content-Type": "application/gpx+xml" },
    body: content,
  });
  if (!response.ok) {
    throw new Error(`Upload failed (HTTP ${response.status}).`);
  }
  return {
    etag: response.headers.get("oc-etag") ?? response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
}

export async function downloadFile(conn: NextcloudConnParams, path: string): Promise<string> {
  const response = await davRequest(conn, path, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status}).`);
  }
  return response.text();
}

/** Deletes `path`. A 404 (already gone) is treated as success. */
export async function deleteFile(conn: NextcloudConnParams, path: string): Promise<void> {
  const response = await davRequest(conn, path, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete failed (HTTP ${response.status}).`);
  }
}

// Exported for tests only.
export const __test__ = { buildDavUrl, basicAuthHeader, normalizeFolder };
