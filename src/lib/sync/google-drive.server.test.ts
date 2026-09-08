import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __test__, buildAuthUrl, isConfigured } from "./google-drive.server";

const { escapeQueryValue } = __test__;

describe("escapeQueryValue", () => {
  it("escapes single quotes and backslashes for use inside a Drive `q` string literal", () => {
    expect(escapeQueryValue("O'Brien's Ride")).toBe("O\\'Brien\\'s Ride");
    expect(escapeQueryValue("back\\slash")).toBe("back\\\\slash");
  });

  it("leaves ordinary names untouched", () => {
    expect(escapeQueryValue("Hodora")).toBe("Hodora");
  });
});

describe("buildAuthUrl", () => {
  const originalId = process.env.GOOGLE_DRIVE_CLIENT_ID;

  beforeEach(() => {
    process.env.GOOGLE_DRIVE_CLIENT_ID = "test-client-id";
  });

  afterEach(() => {
    if (originalId === undefined) delete process.env.GOOGLE_DRIVE_CLIENT_ID;
    else process.env.GOOGLE_DRIVE_CLIENT_ID = originalId;
  });

  it("includes the client id, redirect uri, state, and the drive.file scope", () => {
    const url = new URL(
      buildAuthUrl("https://example.com/api/cloud/google-drive/callback", "opaque-state"),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.com/api/cloud/google-drive/callback",
    );
    expect(url.searchParams.get("state")).toBe("opaque-state");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("drive.file");
  });

  it("throws a clear error when the client id isn't configured", () => {
    delete process.env.GOOGLE_DRIVE_CLIENT_ID;
    expect(() => buildAuthUrl("https://example.com/callback", "state")).toThrow(
      /GOOGLE_DRIVE_CLIENT_ID/,
    );
  });
});

describe("isConfigured", () => {
  const original = {
    id: process.env.GOOGLE_DRIVE_CLIENT_ID,
    secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  };

  afterEach(() => {
    for (const [name, value] of [
      ["GOOGLE_DRIVE_CLIENT_ID", original.id],
      ["GOOGLE_DRIVE_CLIENT_SECRET", original.secret],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("is true only when both the client id and secret are present", () => {
    process.env.GOOGLE_DRIVE_CLIENT_ID = "id";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "secret";
    expect(isConfigured()).toBe(true);
  });

  it("is false when either half is missing — a half-configured deployment can't complete the flow", () => {
    process.env.GOOGLE_DRIVE_CLIENT_ID = "id";
    delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    expect(isConfigured()).toBe(false);

    delete process.env.GOOGLE_DRIVE_CLIENT_ID;
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "secret";
    expect(isConfigured()).toBe(false);
  });

  it("is false when an empty string is set, not just when the variable is absent", () => {
    process.env.GOOGLE_DRIVE_CLIENT_ID = "";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "";
    expect(isConfigured()).toBe(false);
  });
});
