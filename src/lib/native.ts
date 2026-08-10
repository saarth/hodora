/**
 * Native-shell glue for the Capacitor Android build. Everything here is a
 * no-op on the web (Capacitor.isNativePlatform() is false there), so this is
 * safe to import unconditionally from web-only routes/components.
 */

import { Capacitor } from "@capacitor/core";
import type { Theme } from "@/lib/theme";

let backButtonWired = false;

type RouterLike = { history: { back: () => void; canGoBack: () => boolean } };

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
 * theme. Android 15+ (targetSdk 35+) enforces edge-to-edge and ignores
 * StatusBar.setBackgroundColor(), so the status bar area is transparent and
 * painted by the page itself (see the safe-area-aware background in
 * styles.css) rather than by a native background color call.
 */
export async function syncStatusBar(theme: Theme) {
  if (!Capacitor.isNativePlatform()) return;

  const { StatusBar, Style } = await import("@capacitor/status-bar");
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
  } catch {
    // Older Android/edge-to-edge combinations can reject these calls; the
    // page's own safe-area background is the source of truth either way.
  }
}
