import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowUpRight,
  CloudDownload,
  Loader2,
  MoreVertical,
  Mountain,
  Route as RouteIcon,
  Trash2,
  Upload,
} from "lucide-react";
import { listOfflineRideIds } from "@/lib/offline-db";
import { offlineKeys } from "@/components/OfflineSaveCard";
import { DifficultyBadge } from "@/components/RideTags";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistance, formatElevation, parseGpx } from "@/lib/gpx";
import { createRide, deleteRide, fetchProfile, fetchRides, ridesKeys } from "@/lib/rides";
import { triggerCloudSyncIfConnected } from "@/lib/sync/connections";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rides/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My rides — Hodora" },
      {
        name: "description",
        content: "Your imported GPX bike routes with distance, climbing and quick access to navigation.",
      },
      { property: "og:title", content: "My rides — Hodora" },
      { property: "og:description", content: "Your imported GPX bike routes, ready to navigate." },
    ],
  }),
  component: RidesPage,
});

function RidesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const { data: profile } = useQuery({ queryKey: ridesKeys.profile, queryFn: fetchProfile });
  const metric = profile?.unit !== "imperial";

  const { data: rides, isLoading } = useQuery({
    queryKey: ridesKeys.all,
    queryFn: fetchRides,
  });

  const { data: savedIds } = useQuery({
    queryKey: offlineKeys.saved,
    queryFn: listOfflineRideIds,
  });

  useEffect(() => {
    void triggerCloudSyncIfConnected();
  }, []);

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const parsed = parseGpx(text, file.name.replace(/\.gpx$/i, ""));
      return createRide({
        name: parsed.name,
        sourceFilename: file.name,
        distanceM: parsed.distanceM,
        ascentM: parsed.ascentM,
        descentM: parsed.descentM,
        bounds: parsed.bounds,
        points: parsed.points,
      });
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ridesKeys.all });
      toast.success("Route imported");
      void triggerCloudSyncIfConnected();
      navigate({ to: "/rides/$id", params: { id } });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not import that file");
    },
  });

  const removeMutation = useMutation({
    mutationFn: deleteRide,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ridesKeys.all });
      toast.success("Route deleted");
      void triggerCloudSyncIfConnected();
    },
    onError: () => toast.error("Could not delete that route"),
  });

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      // Some file providers (Android SAF, cloud drives) hand back names without
      // the .gpx suffix, so only reject clearly unsupported extensions.
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
      if (ext && !["gpx", "xml", "txt"].includes(ext)) {
        toast.error("Please choose a .gpx file");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error("That file is larger than 20 MB");
        return;
      }
      importMutation.mutate(file);
    },
    [importMutation],
  );

  const totals = useMemo(() => {
    if (!rides?.length) return null;
    return {
      count: rides.length,
      distance: rides.reduce((sum, r) => sum + r.distance_m, 0),
      ascent: rides.reduce((sum, r) => sum + r.ascent_m, 0),
    };
  }, [rides]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8">
        {profile?.deactivated_at ? (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
            <p className="flex-1 text-sm">
              Your account is deactivated. Reactivate it any time from account settings.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/settings">Account settings</Link>
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">My rides</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {totals
                ? `${totals.count} route${totals.count === 1 ? "" : "s"} · ${formatDistance(totals.distance, metric)} · ${formatElevation(totals.ascent, metric)} climbed`
                : "Import a GPX file to get started."}
            </p>
          </div>
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={importMutation.isPending}
            className="glow-ring"
          >
            {importMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Import GPX
          </Button>
        </div>

        <input
          ref={inputRef}
          type="file"
          // Android/WebView pickers often report .gpx as an unknown MIME type and
          // grey the file out when accept is restricted. Accept everything and
          // validate by extension in handleFiles instead.
          accept="*/*"
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
          className={cn(
            "mt-6 rounded-2xl border border-dashed border-border p-8 text-center transition-colors",
            dragging && "border-primary bg-primary/5",
          )}
        >
          <RouteIcon className="mx-auto size-6 text-primary" />
          <p className="mt-3 text-sm font-medium">Drop a GPX file here</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Exports from Komoot, Strava, RideWithGPS and Garmin all work.
          </p>
        </div>

        <section className="mt-8 grid gap-3">
          {isLoading &&
            [0, 1, 2].map((key) => <Skeleton key={key} className="h-24 rounded-2xl" />)}

          {!isLoading && rides?.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No routes yet — your imports will appear here.
            </p>
          )}

          {rides?.map((ride) => (
            <article
              key={ride.id}
              className="surface flex min-w-0 items-center gap-4 p-4 transition-colors hover:border-primary/40"
            >
              <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary sm:flex">
                <Mountain className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <Link
                    to="/rides/$id"
                    params={{ id: ride.id }}
                    className="block truncate font-semibold hover:text-primary"
                  >
                    {ride.name}
                  </Link>
                  {savedIds?.includes(ride.id) && (
                    <span
                      className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary"
                      title="Available offline"
                    >
                      <CloudDownload className="size-3" />
                      Offline
                    </span>
                  )}
                  {ride.difficulty && <DifficultyBadge value={ride.difficulty} />}
                </span>

                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {formatDistance(ride.distance_m, metric)} ·{" "}
                  {formatElevation(ride.ascent_m, metric)} up ·{" "}
                  {new Date(ride.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link to="/rides/$id/nav" params={{ id: ride.id }}>
                  Ride
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Options for ${ride.name}`}>
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => removeMutation.mutate(ride.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    Delete route
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
