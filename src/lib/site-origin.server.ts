// Resolves the origin this deployment is served at for server-side code that
// needs to build absolute URLs (OAuth redirect URIs, settings redirects).
//
// Pinned to the configured `VITE_SITE_URL` when it's set, so a spoofed or
// forwarded `Host` header can't redirect OAuth callbacks to an attacker-
// controlled origin. Falls back to the request origin only when no origin is
// configured (local development), where there's no canonical host to pin to.
//
// Load with a dynamic import inside server handlers, same discipline as the
// other `*.server.ts` modules.
export function siteOrigin(request: Request): string {
  const configured = (
    process.env.VITE_SITE_URL ??
    (import.meta.env.VITE_SITE_URL as string | undefined) ??
    ""
  )
    .trim()
    .replace(/\/+$/, "");
  if (configured) return configured;
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}
