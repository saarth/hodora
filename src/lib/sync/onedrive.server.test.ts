import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __test__, buildAuthUrl, isConfigured } from "./onedrive.server";

const { normalizeFolderName, itemPath } = __test__;

describe("normalizeFolderName", () => {
  it("strips leading and trailing slashes", () => {
    expect(normalizeFolderName("/Hodora/")).toBe("Hodora");
    expect(normalizeFolderName("Hodora")).toBe("Hodora");
  });

  it("falls back to Hodora for an empty/slash-only folder", () => {
    expect(normalizeFolderName("")).toBe("Hodora");
    expect(normalizeFolderName("///")).toBe("Hodora");
  });
});

describe("itemPath", () => {
  it("path-addresses an item under the app root, percent-encoding segments", () => {
    expect(itemPath(["Hodora", "a b.gpx"])).toBe("/me/drive/special/approot:/Hodora/a%20b.gpx");
  });

  it("appends a `:suffix` for relationship endpoints like /children or /content", () => {
    expect(itemPath(["Hodora"], "/children")).toBe("/me/drive/special/approot:/Hodora:/children");
    expect(itemPath(["Hodora", "ride.gpx"], "/content")).toBe(
      "/me/drive/special/approot:/Hodora/ride.gpx:/content",
    );
  });
});

describe("buildAuthUrl", () => {
  const originalId = process.env.ONEDRIVE_CLIENT_ID;

  beforeEach(() => {
    process.env.ONEDRIVE_CLIENT_ID = "test-client-id";
  });

  afterEach(() => {
    if (originalId === undefined) delete process.env.ONEDRIVE_CLIENT_ID;
    else process.env.ONEDRIVE_CLIENT_ID = originalId;
  });

  it("includes the client id, redirect uri, state, and the AppFolder scope", () => {
    const url = new URL(
      buildAuthUrl("https://example.com/api/cloud/onedrive/callback", "opaque-state"),
    );
    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.com/api/cloud/onedrive/callback",
    );
    expect(url.searchParams.get("state")).toBe("opaque-state");
    expect(url.searchParams.get("scope")).toContain("Files.ReadWrite.AppFolder");
  });

  it("throws a clear error when the client id isn't configured", () => {
    delete process.env.ONEDRIVE_CLIENT_ID;
    expect(() => buildAuthUrl("https://example.com/callback", "state")).toThrow(
      /ONEDRIVE_CLIENT_ID/,
    );
  });
});

describe("isConfigured", () => {
  const original = {
    id: process.env.ONEDRIVE_CLIENT_ID,
    secret: process.env.ONEDRIVE_CLIENT_SECRET,
  };

  afterEach(() => {
    for (const [name, value] of [
      ["ONEDRIVE_CLIENT_ID", original.id],
      ["ONEDRIVE_CLIENT_SECRET", original.secret],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("is true only when both the client id and secret are present", () => {
    process.env.ONEDRIVE_CLIENT_ID = "id";
    process.env.ONEDRIVE_CLIENT_SECRET = "secret";
    expect(isConfigured()).toBe(true);
  });

  it("is false when either half is missing — a half-configured deployment can't complete the flow", () => {
    process.env.ONEDRIVE_CLIENT_ID = "id";
    delete process.env.ONEDRIVE_CLIENT_SECRET;
    expect(isConfigured()).toBe(false);

    delete process.env.ONEDRIVE_CLIENT_ID;
    process.env.ONEDRIVE_CLIENT_SECRET = "secret";
    expect(isConfigured()).toBe(false);
  });

  it("is false when an empty string is set, not just when the variable is absent", () => {
    process.env.ONEDRIVE_CLIENT_ID = "";
    process.env.ONEDRIVE_CLIENT_SECRET = "";
    expect(isConfigured()).toBe(false);
  });
});
