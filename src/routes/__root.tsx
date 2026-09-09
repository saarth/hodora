import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";

import appCss from "../styles.css?url";
import { reportError } from "../lib/error-reporting";
import { ThemeProvider, useTheme } from "../lib/theme";
import { Button } from "@/components/ui/button";
import { StatusPage } from "@/components/StatusPage";
import { Toaster } from "@/components/ui/sonner";
import { registerServiceWorker } from "@/lib/pwa";
import { initNativeShell, syncStatusBar } from "@/lib/native";

import { supabase } from "@/integrations/supabase/client";
import { absoluteUrl } from "@/lib/seo";

function NotFoundComponent() {
  return (
    <StatusPage
      documentTitle="Page not found — Hodora"
      code="404 — wrong turn"
      title="This page isn't on the route."
      message="The link is broken, or whatever used to be here has moved. Your saved rides are all still where you left them."
      actions={
        <>
          <Button asChild size="lg" className="glow-ring">
            <Link to="/rides">
              Go to my rides
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/">Back to the home page</Link>
          </Button>
        </>
      }
    />
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <StatusPage
      documentTitle="This page didn't load — Hodora"
      code="Something broke"
      title="This page didn't load."
      message="Something went wrong on our end, not yours. Trying again usually clears it. Any ride you saved for offline is still on this device either way."
      actions={
        <>
          <Button
            size="lg"
            className="glow-ring"
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            <RefreshCw className="size-4" />
            Try again
          </Button>
          {/* A hard navigation, not a <Link>: the router is already in a
              failed state, so rebuilding the app from scratch is the point. */}
          <Button asChild size="lg" variant="secondary">
            <a href="/rides">Go to my rides</a>
          </Button>
        </>
      }
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Hodora — Free bike navigation app for club rides" },
      {
        name: "description",
        content:
          "Free bike navigation app and GPS for cycling. Import a club-ride GPX and follow it turn by turn — no bike computer, no subscription, offline maps included.",
      },
      { property: "og:title", content: "Hodora — Free bike navigation app for club rides" },
      {
        property: "og:description",
        content:
          "Free bike navigation app and GPS for cycling. Import a club-ride GPX and follow it turn by turn — no bike computer, no subscription, offline maps included.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Hodora" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Hodora — Free bike navigation app for club rides" },
      {
        name: "twitter:description",
        content:
          "Free bike navigation app and GPS for cycling. Import a club-ride GPX and follow it turn by turn — no bike computer, no subscription, offline maps included.",
      },
      { property: "og:image", content: absoluteUrl("/og-image.png") },
      { name: "twitter:image", content: absoluteUrl("/og-image.png") },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Fraunces:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Roboto+Mono:wght@400;500;700&display=swap",
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const themeScript = `(function(){try{var s=localStorage.getItem("hodora-theme");var d=s==="light"?false:s==="dark"?true:!window.matchMedia("(prefers-color-scheme: light)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){document.documentElement.classList.add("dark");}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NativeStatusBarSync() {
  const { theme } = useTheme();
  useEffect(() => {
    void syncStatusBar(theme);
  }, [theme]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    registerServiceWorker();
    void initNativeShell(router);
  }, [router]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") {
        return;
      }
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <NativeStatusBarSync />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster position="top-center" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
