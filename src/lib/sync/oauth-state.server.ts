// Signs/verifies the short-lived `state` param carried through an OAuth
// authorize -> provider -> callback round trip. The callback lands as a
// plain browser redirect with no Authorization header, so it can't use
// `authenticateRequest()` — this is how it recovers which user the
// authorize step was for without trusting the browser to say so. Reuses
// `token-crypto.server.ts`'s AES-GCM (auth-tag verified, so a tampered
// state blob throws instead of decoding into something else) rather than a
// second crypto scheme.
//
// Load with a dynamic import inside server handlers, same discipline as
// `token-crypto.server.ts` — see that file's header comment.
import { decryptSecret, encryptSecret } from "./token-crypto.server";

const STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthState = {
  userId: string;
  folder: string;
};

export async function createOAuthState(state: OAuthState): Promise<string> {
  const payload = { ...state, exp: Date.now() + STATE_TTL_MS };
  return encryptSecret(JSON.stringify(payload));
}

/** Returns null for a missing/malformed/tampered/expired state — callers treat that as "connect failed". */
export async function verifyOAuthState(encoded: string): Promise<OAuthState | null> {
  try {
    const decrypted = JSON.parse(await decryptSecret(encoded)) as OAuthState & { exp: number };
    if (typeof decrypted.exp !== "number" || Date.now() > decrypted.exp) return null;
    if (typeof decrypted.userId !== "string" || typeof decrypted.folder !== "string") return null;
    return { userId: decrypted.userId, folder: decrypted.folder };
  } catch {
    return null;
  }
}
