import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";

async function freshModule() {
  vi.resetModules();
  return import("./oauth-state.server");
}

describe("oauth-state", () => {
  const originalKey = process.env.TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = originalKey;
    vi.useRealTimers();
  });

  it("round-trips userId and folder", async () => {
    const { createOAuthState, verifyOAuthState } = await freshModule();
    const state = await createOAuthState({ userId: "user-123", folder: "Hodora" });
    expect(await verifyOAuthState(state)).toEqual({ userId: "user-123", folder: "Hodora" });
  });

  it("rejects a tampered state blob", async () => {
    const { createOAuthState, verifyOAuthState } = await freshModule();
    const state = await createOAuthState({ userId: "user-123", folder: "Hodora" });
    const [iv, ciphertext] = state.split(".");
    const tampered = `${iv}.${ciphertext.slice(0, -4)}${ciphertext.slice(-4) === "AAAA" ? "BBBB" : "AAAA"}`;
    expect(await verifyOAuthState(tampered)).toBeNull();
  });

  it("rejects an expired state blob", async () => {
    vi.useFakeTimers();
    const { createOAuthState, verifyOAuthState } = await freshModule();
    const state = await createOAuthState({ userId: "user-123", folder: "Hodora" });
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(await verifyOAuthState(state)).toBeNull();
  });

  it("rejects garbage input", async () => {
    const { verifyOAuthState } = await freshModule();
    expect(await verifyOAuthState("not-a-real-state")).toBeNull();
  });
});
