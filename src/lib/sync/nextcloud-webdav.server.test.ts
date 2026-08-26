import { afterEach, describe, expect, it, vi } from "vitest";
import { __test__, ensureFolder, listFolder, testConnection } from "./nextcloud-webdav.server";

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

  it("rejects a '..' path segment", () => {
    expect(() => normalizeFolder("../Hodora")).toThrow();
    expect(() => normalizeFolder("Hodora/../../etc")).toThrow();
    expect(() => normalizeFolder("..")).toThrow();
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

describe("isBlockedHostname (SSRF guard)", () => {
  const { isBlockedHostname } = __test__;

  it("blocks loopback, private, link-local, and metadata addresses", () => {
    for (const host of [
      "localhost",
      "printer.local",
      "127.0.0.1",
      "127.53.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata endpoint
      "169.254.0.1",
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "::1",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isBlockedHostname(host)).toBe(true);
    }
  });

  it("allows ordinary public hostnames and IPs", () => {
    for (const host of ["cloud.example.com", "8.8.8.8", "1.1.1.1", "nextcloud.mydomain.org"]) {
      expect(isBlockedHostname(host)).toBe(false);
    }
  });
});

describe("assertPublicHttpUrl (SSRF guard)", () => {
  const { assertPublicHttpUrl } = __test__;

  it("rejects non-http(s) schemes", () => {
    expect(() => assertPublicHttpUrl("file:///etc/passwd")).toThrow();
    expect(() => assertPublicHttpUrl("ftp://cloud.example.com")).toThrow();
  });

  it("rejects blocked hosts", () => {
    expect(() => assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/")).toThrow();
    expect(() => assertPublicHttpUrl("http://localhost:8080/")).toThrow();
  });

  it("rejects malformed URLs", () => {
    expect(() => assertPublicHttpUrl("not a url")).toThrow();
  });

  it("allows a normal public https URL", () => {
    expect(() => assertPublicHttpUrl("https://cloud.example.com/")).not.toThrow();
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

  it("testConnection does not leak the raw HTTP status in its error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    const result = await testConnection(conn);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toMatch(/\b500\b/);
  });

  it("testConnection rejects a connection pointed at a private/internal address without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await testConnection({ ...conn, url: "http://169.254.169.254/" });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ensureFolder rejects a connection pointed at a private/internal address without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      ensureFolder({ ...conn, url: "http://127.0.0.1:8080/" }, "/Hodora"),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("listFolder throws on a 207 with a truncated/malformed body instead of returning an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not really xml at all", { status: 207 })),
    );
    await expect(listFolder(conn, "/Hodora")).rejects.toThrow(/malformed/i);
  });
});
