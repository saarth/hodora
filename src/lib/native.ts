/**
 * Native-shell glue for the Capacitor Android build. Everything here is a
 * no-op on the web (Capacitor.isNativePlatform() is false there), so this is
 * safe to import unconditionally from web-only routes/components.
 */

import { Capacitor } from "@capacitor/core";
import type { Theme } from "@/lib/theme";

let backButtonWired = false;

type RouterLike = { history: { back: () => void; canGoBack: () => boolean } };

/** True inside the Capacitor shell, false on the web (and during SSR). */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

/** Hides the native splash screen and wires the hardware back button to router history. */
export async function initNativeShell(router: RouterLike) {
  if (!Capacitor.isNativePlatform()) return;

  const { SplashScreen } = await import("@capacitor/splash-screen");
  void SplashScreen.hide();

  if (backButtonWired) return;
  backButtonWired = true;

  const { App } = await import("@capacitor/app");
  App.addListener("backButton", () => {
    if (router.history.canGoBack()) {
      router.history.back();
    } else {
      void App.exitApp();
    }
  });
}

/**
 * Keeps the Android status bar icon color in sync with the app's light/dark
 * theme. Android 15+ (targetSdk 35+) enforces edge-to-edge, so the status bar
 * area is transparent and painted by the page itself.
 *
 * Deliberately *not* calling `StatusBar.setOverlaysWebView()`: it drives the
 * deprecated pre-15 `SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN` path, which lays the
 * WebView out under the status bar while Capacitor's own SystemBars plugin is
 * simultaneously trying to inset it — the two fight and the app header ends up
 * drawn on top of the clock. SystemBars already handles edge-to-edge layout
 * and publishes the real insets as the `--safe-area-inset-*` custom
 * properties that styles.css sizes against; leaving it alone is the fix.
 */
export async function syncStatusBar(theme: Theme) {
  if (!Capacitor.isNativePlatform()) return;

  const { StatusBar, Style } = await import("@capacitor/status-bar");
  try {
    await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
  } catch {
    // Older Android/edge-to-edge combinations can reject this call; the
    // page's own safe-area background is the source of truth either way.
  }
}
