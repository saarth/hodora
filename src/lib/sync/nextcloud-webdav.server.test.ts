import { afterEach, describe, expect, it, vi } from "vitest";
import { __test__, listFolder, testConnection } from "./nextcloud-webdav.server";

const { buildDavUrl, basicAuthHeader, normalizeFolder } = __test__;

const conn = { url: "https://cloud.example.com/", username: "rider", password: "app-pass" };

describe("buildDavUrl", () => {
  it("joins the base URL, username, and path, trimming a trailing slash on the base", () => {
    expect(buildDavUrl(conn, "/Hodora/abc.gpx")).toBe(
      "https://cloud.example.com/remote.php/dav/files/rider/Hodora/abc.gpx",
    );
  });

  it("percent-encodes a username with special characters", () => {
    expect(buildDavUrl({ ...conn, username: "ri der@x" }, "/Hodora")).toContain(
      "/files/ri%20der%40x/Hodora",
    );
  });
});

describe("normalizeFolder", () => {
  it("ensures exactly one leading slash and no trailing slash", () => {
    expect(normalizeFolder("Hodora")).toBe("/Hodora");
    expect(normalizeFolder("/Hodora/")).toBe("/Hodora");
    expect(normalizeFolder("")).toBe("");
  });
});

describe("basicAuthHeader", () => {
  it("base64-encodes username:password, including non-ASCII passwords", () => {
    const header = basicAuthHeader("rider", "pässwörd");
    expect(header.startsWith("Basic ")).toBe(true);
    const decoded = atob(header.slice("Basic ".length));
    const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe("rider:pässwörd");
  });
});

describe("network calls against a mocked fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("testConnection reports ok on a 207 Multi-Status response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 207 })));
    expect(await testConnection(conn)).toEqual({ ok: true });
  });

  it("testConnection reports a credentials error on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    const result = await testConnection(conn);
    expect(result.ok).toBe(false);
  });

  it("listFolder parses a multistatus response, keeping only .gpx children", async () => {
    const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:response>
    <d:href>/remote.php/dav/files/rider/Hodora/</d:href>
    <d:propstat>
      <d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/rider/Hodora/ride-1.gpx</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"abc123"</d:getetag>
        <d:getlastmodified>Thu, 06 Aug 2026 12:00:00 GMT</d:getlastmodified>
        <d:getcontentlength>4096</d:getcontentlength>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/rider/Hodora/notes.txt</d:href>
    <d:propstat>
      <d:prop><d:getetag>"xyz"</d:getetag></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(xml, { status: 207 })));

    const files = await listFolder(conn, "/Hodora");
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      path: "/Hodora/ride-1.gpx",
      etag: '"abc123"',
      lastModified: "Thu, 06 Aug 2026 12:00:00 GMT",
      size: 4096,
    });
  });

  it("listFolder returns an empty list for a 404 (folder doesn't exist yet)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    expect(await listFolder(conn, "/Hodora")).toEqual([]);
  });
});
