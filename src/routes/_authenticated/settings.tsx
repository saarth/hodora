import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  BatteryLow,
  Cloud,
  Loader2,
  Mail,
  MoonStar,
  PauseCircle,
  RefreshCw,
  Ruler,
  Save,
  ShieldAlert,
  Trash2,
  Unplug,
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
import { getLowPowerMode, setLowPowerMode } from "@/lib/low-power";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  beginOAuthConnect,
  connectNextcloud,
  disconnectNextcloud,
  disconnectOAuthCloud,
  fetchNextcloudStatus,
  fetchOAuthCloudStatus,
  syncNextcloudNow,
  syncOAuthCloudNow,
  type OAuthProvider,
} from "@/lib/sync/connections";

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

function syncSummaryMessage(
  summary: {
    uploaded: number;
    downloaded: number;
    deletedRemote: number;
    deletedLocal: number;
    conflicts: number;
  },
  hasMore = false,
): string {
  const parts = [
    summary.uploaded > 0 ? `${summary.uploaded} uploaded` : null,
    summary.downloaded > 0 ? `${summary.downloaded} downloaded` : null,
    summary.deletedRemote > 0 ? `${summary.deletedRemote} removed remotely` : null,
    summary.deletedLocal > 0 ? `${summary.deletedLocal} removed locally` : null,
    summary.conflicts > 0 ? `${summary.conflicts} conflicts resolved` : null,
  ].filter(Boolean);
  const base = parts.length > 0 ? `Synced — ${parts.join(", ")}` : "Already up to date";
  // Only reachable after runSyncToCompletion's own round cap — a normal
  // sync run keeps calling the endpoint until the server reports nothing
  // left, so this means there's still unusually more work than that cap
  // covers, not a routine "come back later."
  return hasMore ? `${base} — there's more to sync, run "Sync now" again` : base;
}

const OAUTH_PROVIDER_LABEL: Record<OAuthProvider, string> = {
  "google-drive": "Google Drive",
  onedrive: "OneDrive",
};

function OAuthCloudCard({ provider }: { provider: OAuthProvider }) {
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState("Hodora");
  const label = OAUTH_PROVIDER_LABEL[provider];
  const statusKey = ["cloud", provider, "status"] as const;

  const { data: status } = useQuery({
    queryKey: statusKey,
    queryFn: () => fetchOAuthCloudStatus(provider),
  });

  const connectMutation = useMutation({
    mutationFn: () => beginOAuthConnect(provider, folder),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : `Could not start ${label} sign-in`),
  });

  const syncMutation = useMutation({
    mutationFn: () => syncOAuthCloudNow(provider),
    onSuccess: ({ summary, hasMore }) => {
      queryClient.invalidateQueries({ queryKey: statusKey });
      queryClient.invalidateQueries({ queryKey: ridesKeys.all });
      toast.success(syncSummaryMessage(summary, hasMore));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Sync failed"),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectOAuthCloud(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: statusKey });
      toast.success(`Disconnected ${label}`);
    },
    onError: () => toast.error(`Could not disconnect ${label}`),
  });

  if (status?.connected) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="break-all text-sm text-muted-foreground">
            {status.accountEmail ?? "Connected"} — {status.folder}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {status.lastSyncedAt
              ? `Last synced ${formatDistanceToNow(new Date(status.lastSyncedAt), { addSuffix: true })}`
              : "Not synced yet"}
          </p>
          {status.status === "error" && status.lastError && (
            <p className="mt-1 text-xs text-destructive">{status.lastError}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || status.syncing}
          >
            {syncMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Sync now
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Unplug className="size-4" />
                Disconnect
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect {label}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your routes stay in Hodora and the files stay in {label} — nothing on either side
                  is deleted. You can reconnect any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => disconnectMutation.mutate()}>
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-2">
          <Label htmlFor={`${provider}-folder`}>{label} folder</Label>
          <Input
            id={`${provider}-folder`}
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            className="w-48"
          />
        </div>
        <Button
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending || !folder.trim()}
        >
          {connectMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Cloud className="size-4" />
          )}
          Connect {label}
        </Button>
      </div>
    </div>
  );
}

function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { mode, setMode } = useTheme();
  // Lazy initializer, not an effect: this route's parent layout is
  // ssr:false (client-only), so localStorage is always available here.
  const [lowPower, setLowPower] = useState(() => getLowPowerMode());

  const { data: profile } = useQuery({ queryKey: ridesKeys.profile, queryFn: fetchProfile });

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const [nextcloudUrl, setNextcloudUrl] = useState("");
  const [nextcloudUsername, setNextcloudUsername] = useState("");
  const [nextcloudAppPassword, setNextcloudAppPassword] = useState("");
  const [nextcloudFolder, setNextcloudFolder] = useState("/Hodora");

  useEffect(() => {
    if (!profile) return;
    // Seeds the editable form fields from the loaded profile — not a value
    // derived from props/state during render, so there's no callback to
    // move this into.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayName(profile.display_name ?? "");
    setUsername(profile.username);
  }, [profile]);

  useEffect(() => {
    // Same as above: seeds the editable email field from the loaded user.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  // Google Drive/OneDrive land back here as a plain browser redirect from
  // `/api/cloud/<provider>/callback` (see that route's comment for why it
  // can't just report success as a fetch response) — pick the outcome up
  // from the query string once, toast it, then scrub the params so a
  // refresh doesn't re-show the toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const cloudError = params.get("cloud_error");
    if (!connected && !cloudError) return;

    const providerLabel = (value: string): string =>
      value === "google_drive" ? "Google Drive" : value === "onedrive" ? "OneDrive" : value;

    if (connected) {
      toast.success(`Connected ${providerLabel(connected)}`);
      queryClient.invalidateQueries({ queryKey: ["cloud"] });
    }
    if (cloudError) {
      toast.error(`Could not connect ${providerLabel(cloudError.split(":")[0])}`);
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("connected");
    url.searchParams.delete("cloud_error");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deactivated = Boolean(profile?.deactivated_at);

  const profileMutation = useMutation({
    mutationFn: () => updateProfile({ display_name: displayName.trim() || null, username }),
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

  const nextcloudStatusKey = ["cloud", "nextcloud", "status"] as const;
  const { data: nextcloudStatus } = useQuery({
    queryKey: nextcloudStatusKey,
    queryFn: fetchNextcloudStatus,
  });

  const connectNextcloudMutation = useMutation({
    mutationFn: () =>
      connectNextcloud({
        url: nextcloudUrl,
        username: nextcloudUsername,
        appPassword: nextcloudAppPassword,
        folder: nextcloudFolder,
      }),
    onSuccess: () => {
      setNextcloudAppPassword("");
      queryClient.invalidateQueries({ queryKey: nextcloudStatusKey });
      toast.success("Connected to Nextcloud");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not connect to Nextcloud"),
  });

  const syncNextcloudMutation = useMutation({
    mutationFn: () => syncNextcloudNow(),
    onSuccess: ({ summary, hasMore }) => {
      queryClient.invalidateQueries({ queryKey: nextcloudStatusKey });
      queryClient.invalidateQueries({ queryKey: ridesKeys.all });
      toast.success(syncSummaryMessage(summary, hasMore));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Sync failed"),
  });

  const disconnectNextcloudMutation = useMutation({
    mutationFn: () => disconnectNextcloud(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nextcloudStatusKey });
      toast.success("Disconnected Nextcloud");
    },
    onError: () => toast.error("Could not disconnect Nextcloud"),
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
                    {unit === "metric" ? "km / meters" : "Miles / feet"}
                  </button>
                ))}
              </div>
              <div className="inline-flex items-center gap-1 rounded-xl border border-border p-1">
                <MoonStar className="ml-1.5 size-4 text-muted-foreground" />
                {(["light", "dark", "system"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMode(option)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition-colors",
                      mode === option
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-start justify-between gap-4 border-t border-border pt-4">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <BatteryLow className="size-4 text-muted-foreground" />
                  Low-power mode
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reduces GPS and weather-refresh frequency during navigation and recording to save
                  battery on long rides — location and recorded tracks may be a little less precise.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={lowPower}
                onClick={() => {
                  const next = !lowPower;
                  setLowPower(next);
                  setLowPowerMode(next);
                }}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                  lowPower ? "bg-primary" : "bg-secondary",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-5 rounded-full bg-background shadow transition-transform",
                    lowPower ? "translate-x-[22px]" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
          </Section>

          <Section
            icon={<Cloud className="size-4" />}
            title="Connections"
            description="Sync your routes to a cloud storage account you control."
          >
            {nextcloudStatus?.connected ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Nextcloud</p>
                    <p className="break-all text-sm text-muted-foreground">
                      {nextcloudStatus.username}@{nextcloudStatus.webdavUrl} —{" "}
                      {nextcloudStatus.folder}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {nextcloudStatus.lastSyncedAt
                        ? `Last synced ${formatDistanceToNow(new Date(nextcloudStatus.lastSyncedAt), { addSuffix: true })}`
                        : "Not synced yet"}
                    </p>
                    {nextcloudStatus.status === "error" && nextcloudStatus.lastError && (
                      <p className="mt-1 text-xs text-destructive">{nextcloudStatus.lastError}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncNextcloudMutation.mutate()}
                      disabled={syncNextcloudMutation.isPending || nextcloudStatus.syncing}
                    >
                      {syncNextcloudMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      Sync now
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Unplug className="size-4" />
                          Disconnect
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Disconnect Nextcloud?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Your routes stay in Hodora and the files stay in Nextcloud — nothing on
                            either side is deleted. You can reconnect any time.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => disconnectNextcloudMutation.mutate()}>
                            Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect a Nextcloud account to keep your routes backed up and synced as GPX files
                  in a folder of your choosing.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nextcloud-url">Server URL</Label>
                    <Input
                      id="nextcloud-url"
                      placeholder="https://cloud.example.com"
                      value={nextcloudUrl}
                      onChange={(event) => setNextcloudUrl(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nextcloud-username">Username</Label>
                    <Input
                      id="nextcloud-username"
                      value={nextcloudUsername}
                      onChange={(event) => setNextcloudUsername(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nextcloud-app-password">App password</Label>
                    <Input
                      id="nextcloud-app-password"
                      type="password"
                      placeholder="Settings → Security → Create new app password"
                      value={nextcloudAppPassword}
                      onChange={(event) => setNextcloudAppPassword(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nextcloud-folder">Sync folder</Label>
                    <Input
                      id="nextcloud-folder"
                      value={nextcloudFolder}
                      onChange={(event) => setNextcloudFolder(event.target.value)}
                    />
                  </div>
                </div>
                <Button
                  onClick={() => connectNextcloudMutation.mutate()}
                  disabled={
                    connectNextcloudMutation.isPending ||
                    !nextcloudUrl.trim() ||
                    !nextcloudUsername.trim() ||
                    !nextcloudAppPassword
                  }
                >
                  {connectNextcloudMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Cloud className="size-4" />
                  )}
                  Connect Nextcloud
                </Button>
              </div>
            )}

            <Separator className="my-5" />
            <OAuthCloudCard provider="google-drive" />
            <Separator className="my-5" />
            <OAuthCloudCard provider="onedrive" />
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
