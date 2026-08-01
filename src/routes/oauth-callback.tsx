import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/oauth-callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — Hodora" },
      { name: "description", content: "Completing your Hodora sign-in." },
      { property: "og:title", content: "Signing you in — Hodora" },
      { property: "og:description", content: "Completing your Hodora sign-in." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OAuthCallback,
});

function safePath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function readTokens(): { access_token: string; refresh_token: string } | null {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const access_token = query.get("access_token") ?? hash.get("access_token");
  const refresh_token = query.get("refresh_token") ?? hash.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

function readError(): string | null {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return (
    query.get("error_description") ??
    query.get("error") ??
    hash.get("error_description") ??
    hash.get("error")
  );
}

function OAuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    let cancelled = false;

    const destination =
      safePath(sessionStorage.getItem("hodora:auth-redirect")) ?? "/rides";
    sessionStorage.removeItem("hodora:auth-redirect");

    const finish = async () => {
      const failure = readError();
      if (failure) {
        if (!cancelled) navigate({ to: "/auth", replace: true });
        return;
      }

      const tokens = readTokens();
      if (tokens) {
        const { error } = await supabase.auth.setSession(tokens);
        if (!error) {
          window.history.replaceState(null, "", window.location.pathname);
          if (!cancelled) navigate({ to: destination, replace: true });
          return;
        }
      }

      // No tokens in the URL — the session may already be set by the helper.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (!cancelled) navigate({ to: destination, replace: true });
        return;
      }

      if (!cancelled) {
        setMessage("Could not complete sign-in. Redirecting…");
        navigate({ to: "/auth", replace: true });
      }
    };

    void finish();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p>{message}</p>
      </div>
    </main>
  );
}
