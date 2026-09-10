/**
 * The last-resort error page, served when SSR itself failed (see server.ts
 * and start.ts) — so React never ran, the app CSS was never linked, and none
 * of the design tokens in styles.css are available.
 *
 * That means the brand has to be re-stated inline here: the palette values
 * are copies of `--background`/`--foreground`/`--primary` and friends, in hex
 * rather than oklch so an old browser rendering a crash page still gets the
 * right colours. Keep them in sync with :root and .dark in styles.css if the
 * brand ever moves. Theme comes from `prefers-color-scheme` alone — reading
 * the saved theme would need JS, and this page must survive without it.
 *
 * The mark is referenced by URL rather than inlined: it's a static asset that
 * is almost certainly cached already, and a failed image simply leaves the
 * heading, which is fine.
 */
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load — Hodora</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="robots" content="noindex" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <style>
      :root {
        color-scheme: light;
        --bg: #f2ecdc;
        --fg: #1a1815;
        --muted: #5d6a6b;
        --rust: #b5622f;
        --primary: #1f3a2e;
        --primary-fg: #f7f2e4;
        --border: rgba(26, 24, 21, 0.13);
        --mark: url("/brand-mark-light.svg");
      }
      /* Kept in step with the .dark block in src/styles.css by hand — this page
         ships without the app's stylesheet, so it can't read those tokens. */
      @media (prefers-color-scheme: dark) {
        :root {
          color-scheme: dark;
          --bg: #040c08;
          --fg: #f3eee1;
          --muted: #c2beae;
          --rust: #d8783e;
          --primary: #c9a15d;
          --primary-fg: #16130f;
          --border: rgba(237, 233, 217, 0.26);
          --mark: url("/brand-mark-dark.svg");
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        padding: 0 1.25rem 4rem;
        background: var(--bg);
        color: var(--fg);
        font: 16px/1.6 "Space Grotesk", ui-sans-serif, system-ui, -apple-system, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .wrap { width: 100%; max-width: 56rem; margin: 0 auto; flex: 1; display: flex; flex-direction: column; }
      .brand { display: flex; align-items: center; gap: 0.5rem; height: 5rem; font-weight: 700; font-size: 1.25rem; letter-spacing: -0.02em; }
      .brand i { display: block; width: 2rem; height: 2rem; background: var(--mark) center / contain no-repeat; }
      .body { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 3rem 0; }
      .eyebrow { margin: 0; font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.2em; color: var(--rust); }
      h1 { margin: 1.25rem 0 0; font-size: clamp(2.25rem, 6vw, 3rem); line-height: 1.05; letter-spacing: -0.02em; font-weight: 800; max-width: 20ch; }
      p { margin: 1.25rem 0 0; max-width: 40ch; color: var(--muted); }
      .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 2rem; }
      a, button {
        font: inherit;
        font-weight: 600;
        padding: 0.75rem 1.25rem;
        border-radius: 0.625rem;
        border: 1px solid transparent;
        cursor: pointer;
        text-decoration: none;
      }
      .primary { background: var(--primary); color: var(--primary-fg); }
      .secondary { background: transparent; color: var(--fg); border-color: var(--border); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <a class="brand" href="/" style="padding: 0; border: 0; color: inherit;">
        <i></i>hodora
      </a>
      <div class="body">
        <p class="eyebrow">Something broke</p>
        <h1>This page didn't load.</h1>
        <p>
          Something went wrong on our end, not yours. Trying again usually clears it &mdash;
          and any ride you saved for offline is still on this device either way.
        </p>
        <div class="actions">
          <button class="primary" onclick="location.reload()">Try again</button>
          <a class="secondary" href="/rides">Go to my rides</a>
        </div>
      </div>
    </div>
  </body>
</html>`;
}
