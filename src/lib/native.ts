/**
 * Native-shell glue for the Capacitor Android build. Everything here is a
 * no-op on the web (Capacitor.isNativePlatform() is false there), so this is
 * safe to import unconditionally from web-only routes/components.
 */

import { Capacitor } from "@capacitor/core";
import type { Theme } from "@/lib/theme";

const DARK_BG = "#0b1220";
const LIGHT_BG = "#fbfbfa";

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

/** Keeps the Android status bar background/icon color in sync with the app's light/dark theme. */
export async function syncStatusBar(theme: Theme) {
  if (!Capacitor.isNativePlatform()) return;

  const { StatusBar, Style } = await import("@capacitor/status-bar");
  await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
  await StatusBar.setBackgroundColor({ color: theme === "dark" ? DARK_BG : LIGHT_BG });
}
