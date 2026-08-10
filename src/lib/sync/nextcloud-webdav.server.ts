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
import { MAX_GPX_DOWNLOAD_BYTES, readTextCapped } from "./http.server";

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

/** Thrown by `assertPublicHttpUrl` — distinguishes a rejected URL from a network-level fetch failure. */
export class BlockedUrlError extends Error {}

/**
 * Blocks SSRF against loopback/private/link-local/CGNAT addresses (this
 * includes the `169.254.169.254` cloud-metadata endpoint) before any
 * server-side WebDAV request is issued against a user-supplied server URL.
 * Hostname-based only — it can't defend against DNS rebinding (a domain
 * that resolves to a private IP only after this check runs), since neither
 * the Cloudflare Workers nor the self-hosted Node runtime this code has to
 * run on lets `fetch` pin/inspect the resolved IP. It still closes the
 * trivial, most-likely-to-be-abused case: a user pointing the connection
 * directly at an IP literal or `localhost`.
 */
function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 0) return true; // "this network"
    if (a === 10) return true; // RFC1918
    if (a === 127) return true; // loopback
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  if (host === "::1" || host === "::") return true;
  if (host.startsWith("fe80:") || host.startsWith("fe8") || host.startsWith("fe9")) return true;
  if (host.startsWith("fea") || host.startsWith("feb")) return true; // fe80::/10 link-local
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // fc00::/7 unique local
  const v4mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4mapped) return isBlockedHostname(v4mapped[1]);

  return false;
}

/** Throws `BlockedUrlError` unless `url` is an `http(s)` URL pointing somewhere other than a loopback/private/link-local address. */
function assertPublicHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BlockedUrlError("Invalid server URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BlockedUrlError("Server URL must be http:// or https://.");
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new BlockedUrlError("That server address isn't allowed.");
  }
}

/**
 * Not a cross-user boundary either way — this only ever addresses the
 * caller's own DAV namespace with their own credentials — but a `..`
 * segment has no legitimate reason to appear in a sync-folder name, so
 * reject it outright rather than relying on `buildDavUrl`'s per-segment
 * `encodeURIComponent` to make it merely harmless.
 */
function normalizeFolder(folder: string): string {
  const trimmed = folder.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed.split("/").some((segment) => segment === "..")) {
    throw new Error("Sync folder name can't contain '..'.");
  }
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
  const url = buildDavUrl(conn, path);
  assertPublicHttpUrl(url);
  return fetch(url, {
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
      // Deliberately generic: echoing the exact HTTP status back to the
      // caller would give an authenticated user a status-code oracle for
      // probing whatever this server can reach (see assertPublicHttpUrl's
      // doc comment for why that's a real, not just theoretical, concern).
      return { ok: false, message: "Could not connect. Check the server URL." };
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof BlockedUrlError) return { ok: false, message: error.message };
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
  // A well-formed 207 always has a <multistatus> root, even for an empty
  // folder (it still contains the folder's own <response> entry). Its
  // absence means the body was truncated or otherwise garbled — surface
  // that as a failure instead of quietly treating it as "zero files,"
  // which the sync engine can't distinguish from a real empty folder.
  if (!parsed.multistatus) {
    throw new Error("Could not list the sync folder (malformed server response).");
  }
  const responses = parsed.multistatus.response;
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
  return readTextCapped(response, MAX_GPX_DOWNLOAD_BYTES);
}

/** Deletes `path`. A 404 (already gone) is treated as success. */
export async function deleteFile(conn: NextcloudConnParams, path: string): Promise<void> {
  const response = await davRequest(conn, path, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete failed (HTTP ${response.status}).`);
  }
}

// Exported for tests only.
export const __test__ = {
  buildDavUrl,
  basicAuthHeader,
  normalizeFolder,
  isBlockedHostname,
  assertPublicHttpUrl,
};
