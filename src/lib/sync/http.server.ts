// Shared helper for reading a `fetch` response body as text with a hard
// size cap, used by every provider's GPX `downloadFile()`. Without this, a
// corrupted or unexpectedly huge file sitting in the user's own cloud
// folder gets fully buffered into memory via `.text()` on every sync
// attempt — a single bad file can repeatedly stress (or, in a
// memory-constrained isolate, crash) that user's sync run. Streams and
// counts bytes as they arrive rather than checking `Content-Length` (which
// a server can omit or misreport) after the fact.
export class ResponseTooLargeError extends Error {}

/** A GPX track file has no legitimate reason to be anywhere near this size — generous headroom over even a multi-day ride recording. */
export const MAX_GPX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export async function readTextCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ResponseTooLargeError(
        `File too large (over ${Math.round(maxBytes / (1024 * 1024))} MB).`,
      );
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
