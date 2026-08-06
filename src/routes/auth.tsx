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
        content: "Sign in to Hodora with your email to import and navigate your GPX bike routes.",
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

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState<null | "email">(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checkEmail, setCheckEmail] = useState(false);

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
