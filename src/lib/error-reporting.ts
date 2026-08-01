/**
 * Pluggable error reporting for errors caught by the root error boundary
 * (src/routes/__root.tsx). By default this just logs to the console, which
 * is enough for local development.
 *
 * To send these errors to a real error-tracking service in production
 * (Sentry, Bugsnag, your own logging endpoint, ...), assign
 * `window.__errorReporting` during app bootstrap, e.g. in
 * `src/routes/__root.tsx`'s `RootShell`:
 *
 *   import * as Sentry from "@sentry/react";
 *   Sentry.init({ dsn: "..." });
 *   window.__errorReporting = {
 *     captureException: (error, context) => Sentry.captureException(error, { extra: context }),
 *   };
 *
 * Nothing here depends on a specific vendor — swap the sink for whatever
 * you use.
 */

type ErrorReportingContext = Record<string, unknown>;

type ErrorReportingSink = {
  captureException?: (error: unknown, context?: ErrorReportingContext) => void;
};

declare global {
  interface Window {
    __errorReporting?: ErrorReportingSink;
  }
}

export function reportError(error: unknown, context: ErrorReportingContext = {}) {
  if (typeof window === "undefined") return;

  const payload = {
    source: "react_error_boundary",
    route: window.location.pathname,
    ...context,
  };

  try {
    window.__errorReporting?.captureException?.(error, payload);
  } catch {
    // A broken reporting sink should never break the app.
  }

  if (import.meta.env.DEV) {
    console.error("[error-boundary]", error, payload);
  }
}
