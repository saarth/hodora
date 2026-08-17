import type { CapacitorConfig } from "@capacitor/cli";

// Hodora is a TanStack Start app with real server routes (account deletion,
// Google Drive/OneDrive/Nextcloud cloud sync) that need a live backend — they
// can't run from assets bundled into the APK. So the Android app doesn't ship
// a local build; it's a native shell whose WebView loads the deployed site
// directly, same as installing the PWA but with a real app icon, splash
// screen, status bar theming, and hardware back button support.
//
// `www/` only holds a placeholder — see www/index.html — needed because
// `cap add android`/`cap sync` require a webDir to exist, even though
// server.url means it's never actually shown.
//
// Override the target host for local development, e.g.:
//   CAPACITOR_SERVER_URL=http://10.0.2.2:8080 npx cap sync android   # Android emulator
//   CAPACITOR_SERVER_URL=http://<lan-ip>:8080 npx cap sync android  # physical device
const serverUrl = process.env.CAPACITOR_SERVER_URL || "https://hodora.app";

const config: CapacitorConfig = {
  appId: "app.hodora.mobile",
  appName: "Hodora",
  webDir: "www",
  server: {
    url: serverUrl,
    // Only matters for the https:// production URL — cleartext must stay
    // off there. It's ignored for http:// dev URLs (Capacitor allows
    // cleartext automatically when server.url itself is http).
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#152A21",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

export default config;
