import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Compass, LogIn, LogOut, Moon, Route, Ruler, Settings, Sun, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online";
import { useUser } from "@/hooks/use-user";

import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, ridesKeys, updateUnit } from "@/lib/rides";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AppHeader() {
  const { theme, toggle } = useTheme();
  const online = useOnlineStatus();
  const { user, loading } = useUser();

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ridesKeys.profile,
    queryFn: fetchProfile,
  });

  const initials = (profile?.display_name || profile?.username || "R")
    .slice(0, 2)
    .toUpperCase();

  const signedIn = Boolean(user);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/rides", replace: true });
  }

  async function handleUnitToggle() {
    const next = profile?.unit === "imperial" ? "metric" : "imperial";
    await updateUnit(next);
    queryClient.invalidateQueries({ queryKey: ridesKeys.profile });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="accent-gradient flex size-9 items-center justify-center rounded-xl text-primary-foreground">
            <Bike className="size-5" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight">
            Hodora
          </span>
        </Link>

        <div className="flex items-center gap-1.5">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/explore">
              <Compass className="size-4" />
              Explore
            </Link>
          </Button>

          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/plan">
              <Route className="size-4" />
              Plan
            </Link>
          </Button>

          {!online && (
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <WifiOff className="size-3.5" />
              Offline
            </span>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          {!signedIn ? (
            !loading && (
              <Button asChild size="sm" variant="secondary">
                <Link to="/auth" search={{ redirect: "/rides" }}>
                  <LogIn className="size-4" />
                  Sign in
                </Link>
              </Button>
            )
          ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Account menu"
              >
                <Avatar className="size-9 border border-border">
                  {profile?.avatar_url ? (
                    <AvatarImage src={profile.avatar_url} alt="" />
                  ) : null}
                  <AvatarFallback className="bg-secondary text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col">
                <span className="text-sm font-semibold">
                  {profile?.display_name || profile?.username || "Rider"}
                </span>
                {profile?.username ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    @{profile.username}
                  </span>
                ) : null}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="size-4" />
                  Account settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleUnitToggle}>
                <Ruler className="size-4" />
                Units: {profile?.unit === "imperial" ? "Miles / feet" : "Km / meters"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
