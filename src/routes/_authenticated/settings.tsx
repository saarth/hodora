import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  Mail,
  MoonStar,
  PauseCircle,
  Ruler,
  Save,
  ShieldAlert,
  Trash2,
  User as UserIcon,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { fetchProfile, ridesKeys } from "@/lib/rides";
import {
  purgeLocalData,
  setAccountDeactivated,
  updateEmail,
  updatePassword,
  updateProfile,
} from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/settings")({

  head: () => ({
    meta: [
      { title: "Account settings — Hodora" },
      {
        name: "description",
        content:
          "Update your Hodora profile, units, email and password, or deactivate and delete your rider account.",
      },
      { property: "og:title", content: "Account settings — Hodora" },
      {
        property: "og:description",
        content: "Manage your Hodora rider profile, preferences and account status.",
      },
    ],
  }),
  component: SettingsPage,
});


function Section({
  icon,
  title,
  description,
  children,
  danger,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5 sm:p-6",
        danger && "border-destructive/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground",
            danger && "bg-destructive/10 text-destructive",
          )}
        >
          {icon}
        </span>
        <div>
          <h2 className="font-display text-base font-bold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { theme, toggle } = useTheme();

  const { data: profile } = useQuery({ queryKey: ridesKeys.profile, queryFn: fetchProfile });

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setUsername(profile.username);
  }, [profile]);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);


  const deactivated = Boolean(profile?.deactivated_at);

  const profileMutation = useMutation({
    mutationFn: () =>
      updateProfile({ display_name: displayName.trim() || null, username }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ridesKeys.profile });
      toast.success("Profile updated");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save your profile"),
  });

  const unitMutation = useMutation({
    mutationFn: (unit: "metric" | "imperial") => updateProfile({ unit }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ridesKeys.profile }),
    onError: () => toast.error("Could not change units"),
  });

  const emailMutation = useMutation({
    mutationFn: () => updateEmail(email),
    onSuccess: () => toast.success("Check your inbox to confirm the new address"),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update your email"),
  });

  const passwordMutation = useMutation({
    mutationFn: () => updatePassword(password),
    onSuccess: () => {
      setPassword("");
      toast.success("Password updated");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update your password"),
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      await setAccountDeactivated(true);
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      toast.success("Account deactivated — sign back in any time to reactivate");
      navigate({ to: "/auth", replace: true });
    },
    onError: () => toast.error("Could not deactivate your account"),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => setAccountDeactivated(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ridesKeys.profile });
      toast.success("Welcome back — your account is active again");
    },
    onError: () => toast.error("Could not reactivate your account"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error("You must be signed in to delete your account");
      }

      const response = await fetch(`${window.location.origin}/api/delete-account`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Could not delete your account");
      }

      await purgeLocalData();
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      toast.success("Your account and all routes were deleted");
      navigate({ to: "/", replace: true });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not delete your account"),
  });



  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Account settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your rider profile, preferences and account status.
        </p>

        {deactivated && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
            <AlertTriangle className="size-4 text-destructive" />
            <p className="flex-1 text-sm">
              This account is deactivated. Your routes are kept but hidden.
            </p>
            <Button
              size="sm"
              onClick={() => reactivateMutation.mutate()}
              disabled={reactivateMutation.isPending}
            >
              {reactivateMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Reactivate
            </Button>
          </div>
        )}

        <div className="mt-6 space-y-5">
          <Section
            icon={<UserIcon className="size-4" />}
            title="Profile"
            description="How you show up inside Hodora."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  maxLength={60}
                  placeholder="Your name"
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  maxLength={24}
                  placeholder="rider"
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
            </div>
            <Button
              className="mt-4"
              onClick={() => profileMutation.mutate()}
              disabled={profileMutation.isPending || !username.trim()}
            >
              {profileMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save profile
            </Button>
          </Section>

          <Section
            icon={<Ruler className="size-4" />}
            title="Preferences"
            description="Units and appearance for maps, stats and navigation."
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-xl border border-border p-1">
                {(["metric", "imperial"] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => unitMutation.mutate(unit)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                      (profile?.unit ?? "metric") === unit
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {unit === "metric" ? "Km / meters" : "Miles / feet"}
                  </button>
                ))}
              </div>
              <Button variant="outline" onClick={toggle}>
                <MoonStar className="size-4" />
                {theme === "dark" ? "Dark theme" : "Light theme"}
              </Button>
            </div>
          </Section>

          <Section
            icon={<Mail className="size-4" />}
            title="Sign-in details"
            description="Update the email address and password you use to sign in."
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    className="min-w-[220px] flex-1"
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => emailMutation.mutate()}
                    disabled={emailMutation.isPending || !email.trim() || email === user?.email}
                  >
                    {emailMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                    Update email
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    placeholder="At least 8 characters"
                    className="min-w-[220px] flex-1"
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => passwordMutation.mutate()}
                    disabled={passwordMutation.isPending || password.length < 8}
                  >
                    {passwordMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                    Update password
                  </Button>
                </div>
              </div>
            </div>
          </Section>

          <Section
            danger
            icon={<ShieldAlert className="size-4" />}
            title="Deactivate or delete"
            description="Take a break, or remove everything permanently."
          >
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Deactivate account</p>
                  <p className="text-sm text-muted-foreground">
                    Signs you out and hides your rides. Nothing is deleted — sign back in and
                    reactivate whenever you want.
                  </p>
                </div>
                {deactivated ? (
                  <Button
                    variant="outline"
                    onClick={() => reactivateMutation.mutate()}
                    disabled={reactivateMutation.isPending}
                  >
                    Reactivate
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline">
                        <PauseCircle className="size-4" />
                        Deactivate
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate your account?</AlertDialogTitle>
                        <AlertDialogDescription>
                          You will be signed out. Your routes and offline maps stay saved, and
                          signing back in lets you reactivate instantly.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deactivateMutation.mutate()}
                          disabled={deactivateMutation.isPending}
                        >
                          Deactivate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-destructive">Delete account</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently removes your login, profile, every imported route and all offline
                    data. This cannot be undone.
                  </p>
                </div>

                <AlertDialog onOpenChange={() => setConfirmText("")}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="size-4" />
                      Delete account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete your account permanently?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Type DELETE below to confirm. Every route, offline map and account detail
                        will be erased immediately.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                      value={confirmText}
                      placeholder="DELETE"
                      onChange={(event) => setConfirmText(event.target.value)}
                    />
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={confirmText !== "DELETE" || deleteMutation.isPending}
                        onClick={(event) => {
                          event.preventDefault();
                          deleteMutation.mutate();
                        }}
                      >
                        {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                        Delete forever
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}
