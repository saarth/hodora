import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";

async function freshModule() {
  vi.resetModules();
  const mod = await import("./token-crypto.server");
  return mod;
}

describe("token-crypto", () => {
  const originalKey = process.env.TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = originalKey;
  });

  it("round-trips a secret", async () => {
    const { encryptSecret, decryptSecret } = await freshModule();
    const encoded = await encryptSecret("super-secret-app-password");
    expect(await decryptSecret(encoded)).toBe("super-secret-app-password");
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const { encryptSecret } = await freshModule();
    const a = await encryptSecret("same-plaintext");
    const b = await encryptSecret("same-plaintext");
    expect(a).not.toBe(b);
  });

  it("fails closed when the ciphertext is tampered with", async () => {
    const { encryptSecret, decryptSecret } = await freshModule();
    const encoded = await encryptSecret("super-secret-app-password");
    const [iv, ciphertext] = encoded.split(".");
    const tampered = `${iv}.${ciphertext.slice(0, -4)}${ciphertext.slice(-4) === "AAAA" ? "BBBB" : "AAAA"}`;
    await expect(decryptSecret(tampered)).rejects.toThrow();
  });

  it("fails closed when decrypted with the wrong key", async () => {
    const { encryptSecret } = await freshModule();
    const encoded = await encryptSecret("super-secret-app-password");
    process.env.TOKEN_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const { decryptSecret } = await freshModule();
    await expect(decryptSecret(encoded)).rejects.toThrow();
  });
});
