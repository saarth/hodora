// Encrypts secrets (Nextcloud app passwords today, OAuth refresh tokens for
// Google Drive/OneDrive later) before they're stored in the
// `cloud_connections.encrypted_secret` column. AES-GCM via the Web Crypto
// API, which is a global in both the Cloudflare Workers runtime and modern
// Node — no `node:crypto` import and no new dependency needed, so the same
// code runs unmodified across this app's two deploy targets.
//
// Load with a dynamic import inside server handlers, same discipline as
// `client.server.ts`'s `supabaseAdmin` — this module touches real secret
// material and shouldn't end up reachable from client-bundled code.

const ALGORITHM = "AES-GCM";
const IV_BYTES = 12;

let cachedKey: Promise<CryptoKey> | undefined;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function importKey(): Promise<CryptoKey> {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Missing TOKEN_ENCRYPTION_KEY environment variable. Generate one with `openssl rand -base64 32` (see .env.example).",
    );
  }
  const keyBytes = base64ToBytes(raw);
  if (keyBytes.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to 32 bytes, got ${keyBytes.length}. Generate one with \`openssl rand -base64 32\`.`,
    );
  }
  return crypto.subtle.importKey("raw", keyBytes as BufferSource, ALGORITHM, false, [
    "encrypt",
    "decrypt",
  ]);
}

function getKey(): Promise<CryptoKey> {
  if (!cachedKey) cachedKey = importKey();
  return cachedKey;
}

/** Encrypts `plaintext`, returning `base64(iv).base64(ciphertext+tag)`. */
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    key,
    encoded as BufferSource,
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

/** Reverses `encryptSecret`. Throws if the key is wrong or the ciphertext was tampered with. */
export async function decryptSecret(encoded: string): Promise<string> {
  const [ivPart, ciphertextPart] = encoded.split(".");
  if (!ivPart || !ciphertextPart) {
    throw new Error("Malformed encrypted secret");
  }
  const key = await getKey();
  const iv = base64ToBytes(ivPart);
  const ciphertext = base64ToBytes(ciphertextPart);
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}
