/**
 * Where donations go, and what to do when they go nowhere yet.
 *
 * Each entry is a URL or `null`. `null` means "not set up", and the support
 * page skips that card entirely rather than rendering a button that 404s —
 * a dead donate link costs more trust than a missing one.
 *
 * Filling these in is a one-line change per platform:
 *   - GitHub Sponsors: github.com/sponsors/<user>, *after* enabling Sponsors
 *     on the account. The URL resolves either way — an account that has not
 *     enabled it serves a page with no tiers and nothing to click — so this
 *     one cannot be verified by whether it 404s. Check the page shows tiers.
 *   - Revolut: the handle from Revolut → payment link (revolut.me/<handle>).
 *
 * Revolut rather than PayPal is deliberate. Both are just outbound links, so
 * neither needs an integration or a key; Revolut takes a smaller cut and the
 * link is cleaner. The trade is reach — a Revolut payment link asks a payer
 * outside its supported regions to enter card details on a page they may not
 * recognise, where PayPal is a name everyone already knows. Adding PayPal
 * alongside later means adding one more entry here.
 */
export const SUPPORT_LINKS = {
  githubSponsors: "https://github.com/sponsors/saarth" as string | null,
  revolut: "https://revolut.me/saarth" as string | null,
};

export type SupportPlatform = keyof typeof SUPPORT_LINKS;

/** True when at least one donation link is configured — the page hides the whole money section otherwise. */
export function hasAnySupportLink(): boolean {
  return Object.values(SUPPORT_LINKS).some((url) => Boolean(url));
}
