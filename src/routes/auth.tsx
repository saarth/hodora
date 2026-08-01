import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Mountain, Route as RouteIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Hodora" },
      {
        name: "description",
        content: "Sign in to Hodora with Google or email to import and navigate your GPX bike routes.",
      },
      { property: "og:title", content: "Sign in — Hodora" },
      { property: "og:description", content: "Sign in to import and navigate your GPX bike routes." },
    ],
  }),
  pendingComponent: AuthPending,
  component: AuthPage,
});


const signUpSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  username: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(24, "At most 24 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores only"),
  password: z.string().min(8, "Use at least 8 characters").max(72),
});

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(1, "Enter your password").max(72),
});

type OAuthDiag = {
  message: string;
  code?: string;
  status?: string;
  name?: string;
  source: string;
  raw: string;
};

function pick(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

function describeOAuthError(error: unknown, context?: unknown): OAuthDiag {
  const bag: Record<string, unknown> =
    error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const message =
    pick(bag, "message") ??
    pick(bag, "error_description") ??
    pick(bag, "error") ??
    (typeof error === "string" ? error : "Unknown error");

  let raw: string;
  try {
    raw = JSON.stringify(
      {
        error: {
          ...bag,
          message,
          name: (error as Error)?.name,
          stack: (error as Error)?.stack,
        },
        context,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        origin: typeof window !== "undefined" ? window.location.origin : undefined,
        inIframe: typeof window !== "undefined" ? window.top !== window.self : undefined,
        at: new Date().toISOString(),
      },
      null,
      2,
    );
  } catch {
    raw = String(error);
  }

  return {
    message,
    code: pick(bag, "code") ?? pick(bag, "error_code") ?? pick(bag, "error"),
    status: pick(bag, "status") ?? pick(bag, "statusCode") ?? pick(bag, "http_status"),
    name: (error as Error)?.name,
    source: "google-oauth",
    raw,
  };
}

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState<null | "email" | "google">(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checkEmail, setCheckEmail] = useState(false);
  const [oauthDiag, setOauthDiag] = useState<OAuthDiag | null>(null);

  const destination = safePath(search.redirect) ?? "/rides";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: destination, replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
        navigate({ to: destination, replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [destination, navigate]);

  // Surface errors Google/Supabase handed back on the redirect itself.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const collected: Record<string, string> = {};
    for (const params of [query, hash]) {
      for (const key of ["error", "error_code", "error_description", "message", "state"]) {
        const value = params.get(key);
        if (value) collected[key] = value;
      }
    }
    if (Object.keys(collected).length === 0) return;
    setOauthDiag(describeOAuthError(collected, { from: "redirect-params" }));
  }, []);



  async function handleGoogle() {
    setBusy("google");
    setOauthDiag(null);
    try {
      sessionStorage.setItem("hodora:auth-redirect", destination);
    } catch {
      // ignore storage failures
    }
    try {
      // Supabase's own Google OAuth: this redirects the whole page to
      // Google immediately (data.url), then Google redirects back to
      // redirectTo — there's no "session already established" path to
      // handle in this same call. /oauth-callback picks the session up
      // once we're back.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/oauth-callback` },
      });
      if (error) {
        setBusy(null);
        setOauthDiag(describeOAuthError(error));
        toast.error(error.message || "Google sign-in failed. Please try again.");
      }
    } catch (thrown) {
      setBusy(null);
      setOauthDiag(describeOAuthError(thrown));
      toast.error(thrown instanceof Error ? thrown.message : "Google sign-in failed");
    }
  }


  async function handleEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const form = new FormData(event.currentTarget);
    const values = {
      email: String(form.get("email") ?? ""),
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    const parsed =
      mode === "signup"
        ? signUpSchema.safeParse(values)
        : signInSchema.safeParse({ email: values.email, password: values.password });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setBusy("email");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: values.email.trim(),
          password: values.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: values.username.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setCheckEmail(true);
          return;
        }
        navigate({ to: destination, replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email.trim(),
          password: values.password,
        });
        if (error) throw error;
        navigate({ to: destination, replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function handleForgotPassword(email: string) {
    if (!email.trim()) {
      toast.error("Enter your email address first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset link sent — check your inbox.");
  }

  return (
    <main className="hero-surface flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="accent-gradient flex size-9 items-center justify-center rounded-xl text-primary-foreground">
            <RouteIcon className="size-5" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight">Hodora</span>
        </Link>

        <div className="surface p-6 sm:p-8">
          {checkEmail ? (
            <div className="text-center">
              <Mountain className="mx-auto size-8 text-primary" />
              <h1 className="mt-4 text-xl font-bold">Confirm your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent you a confirmation link. Click it and you'll land right back
                here, signed in.
              </p>
              <Button
                variant="ghost"
                className="mt-6"
                onClick={() => {
                  setCheckEmail(false);
                  setMode("signin");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold">
                {mode === "signup" ? "Create your account" : "Welcome back"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {mode === "signup"
                  ? "Pick a rider name and start importing routes."
                  : "Sign in to reach your route library."}
              </p>

              <Button
                type="button"
                variant="secondary"
                className="mt-6 w-full"
                onClick={handleGoogle}
                disabled={busy !== null}
              >
                {busy === "google" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <GoogleMark />
                )}
                Continue with Google
              </Button>

              {oauthDiag && (
                <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-left">
                  <p className="text-sm font-semibold text-destructive">
                    Google sign-in failed
                  </p>
                  <p className="mt-1 break-words text-xs text-foreground">
                    {oauthDiag.message}
                  </p>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <dt>Code</dt>
                    <dd className="break-all font-mono">{oauthDiag.code ?? "—"}</dd>
                    <dt>Status</dt>
                    <dd className="break-all font-mono">{oauthDiag.status ?? "—"}</dd>
                    <dt>Type</dt>
                    <dd className="break-all font-mono">{oauthDiag.name ?? "—"}</dd>
                    <dt>Source</dt>
                    <dd className="break-all font-mono">{oauthDiag.source}</dd>
                  </dl>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Raw details
                    </summary>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background/70 p-2 text-[10px] leading-relaxed">
                      {oauthDiag.raw}
                    </pre>
                  </details>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard
                          ?.writeText(oauthDiag.raw)
                          .then(() => toast.success("Diagnostics copied"))
                          .catch(() => toast.error("Could not copy"));
                      }}
                    >
                      Copy
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setOauthDiag(null)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}



              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  or
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>


              <Tabs
                value={mode}
                onValueChange={(value) => {
                  setMode(value as "signin" | "signup");
                  setErrors({});
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Sign up</TabsTrigger>
                </TabsList>

                {(["signin", "signup"] as const).map((tab) => (
                  <TabsContent key={tab} value={tab} className="mt-5">
                    <form onSubmit={handleEmail} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor={`${tab}-email`}>Email</Label>
                        <Input
                          id={`${tab}-email`}
                          name="email"
                          type="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          maxLength={255}
                        />
                        {errors.email && (
                          <p className="text-xs text-destructive">{errors.email}</p>
                        )}
                      </div>

                      {tab === "signup" && (
                        <div className="space-y-1.5">
                          <Label htmlFor="signup-username">Username</Label>
                          <Input
                            id="signup-username"
                            name="username"
                            autoComplete="username"
                            placeholder="hillclimber"
                            maxLength={24}
                          />
                          {errors.username && (
                            <p className="text-xs text-destructive">{errors.username}</p>
                          )}
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`${tab}-password`}>Password</Label>
                          {tab === "signin" && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                              onClick={(event) => {
                                const form = event.currentTarget.closest("form");
                                const email = form?.querySelector<HTMLInputElement>(
                                  'input[name="email"]',
                                )?.value;
                                void handleForgotPassword(email ?? "");
                              }}
                            >
                              Forgot password?
                            </button>
                          )}
                        </div>
                        <Input
                          id={`${tab}-password`}
                          name="password"
                          type="password"
                          autoComplete={tab === "signup" ? "new-password" : "current-password"}
                          placeholder="••••••••"
                          maxLength={72}
                        />
                        {errors.password && (
                          <p className="text-xs text-destructive">{errors.password}</p>
                        )}
                      </div>

                      <Button type="submit" className="w-full" disabled={busy !== null}>
                        {busy === "email" && <Loader2 className="size-4 animate-spin" />}
                        {tab === "signup" ? "Create account" : "Sign in"}
                      </Button>
                    </form>
                  </TabsContent>
                ))}
              </Tabs>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function AuthPending() {
  return (
    <main className="hero-surface flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="accent-gradient flex size-9 items-center justify-center rounded-xl text-primary-foreground">
            <RouteIcon className="size-5" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight">Hodora</span>
        </div>
        <div className="surface flex flex-col items-center justify-center p-8 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Loading sign-in…</p>
        </div>
      </div>
    </main>
  );
}

function safePath(value?: string): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}


function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.26-1.62 3.7-5.5 3.7A6.1 6.1 0 0 1 12 5.9c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.3 12 2.3 6.9 2.3 2.8 6.4 2.8 11.5S6.9 20.7 12 20.7c5.5 0 9.1-3.9 9.1-9.3 0-.6-.06-1.05-.15-1.2H12Z"
      />
    </svg>
  );
}
