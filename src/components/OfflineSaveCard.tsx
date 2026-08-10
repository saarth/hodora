import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudDownload, CloudOff, Loader2, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getOfflineRide } from "@/lib/offline-db";
import {
  downloadRouteTiles,
  estimateTileCount,
  isRouteMapSaved,
  isRouteTileSetTruncated,
  removeRouteTiles,
} from "@/lib/offline-tiles";
import { deleteOfflineRide, putOfflineRide } from "@/lib/offline-db";
import { useOnlineStatus } from "@/hooks/use-online";
import type { Ride } from "@/lib/rides";

export const offlineKeys = {
  ride: (id: string) => ["offline", "ride", id] as const,
  saved: ["offline", "saved"] as const,
};

export function OfflineSaveCard({ ride }: { ride: Ride }) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [progress, setProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: offlineKeys.ride(ride.id),
    queryFn: async () => {
      const [record, tiles] = await Promise.all([
        getOfflineRide(ride.id),
        isRouteMapSaved(ride.points),
      ]);
      return { route: Boolean(record), tiles };
    },
  });

  useEffect(() => () => abortRef.current?.abort(), []);

  const saved = Boolean(status?.route && status?.tiles);
  const tileCount = estimateTileCount(ride.points);
  const approxMb = Math.max(1, Math.round((tileCount * 22) / 1024));
  const truncated = isRouteTileSetTruncated(ride.points);

  async function handleSave() {
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(0);
    try {
      await putOfflineRide(ride);
      await downloadRouteTiles(
        ride.points,
        (done, total) => setProgress(Math.round((done / total) * 100)),
        controller.signal,
      );
      toast.success("Route and maps saved for offline use");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this route offline");
    } finally {
      setProgress(null);
      abortRef.current = null;
      queryClient.invalidateQueries({ queryKey: offlineKeys.ride(ride.id) });
      queryClient.invalidateQueries({ queryKey: offlineKeys.saved });
    }
  }

  async function handleRemove() {
    await Promise.all([deleteOfflineRide(ride.id), removeRouteTiles(ride.points)]);
    queryClient.invalidateQueries({ queryKey: offlineKeys.ride(ride.id) });
    queryClient.invalidateQueries({ queryKey: offlineKeys.saved });
    toast.success("Offline copy removed");
  }

  const downloading = progress !== null;

  return (
    <div className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {saved ? (
              <CloudDownload className="size-3.5 text-primary" />
            ) : (
              <CloudOff className="size-3.5" />
            )}
            Offline
          </h2>
          <p className="mt-2 text-sm">
            {isLoading
              ? "Checking your offline copy…"
              : saved
                ? "Route and map tiles are stored on this device — navigation works with no signal."
                : `Save the route plus about ${tileCount.toLocaleString()} map tiles (~${approxMb} MB) to ride it offline.`}
          </p>
          {!online && !saved && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
              <WifiOff className="size-3.5" />
              You're offline — reconnect to download maps.
            </p>
          )}
          {truncated && (
            <p className="mt-2 text-xs text-destructive">
              This route is long enough that only part of its map can be saved for offline use —
              some sections may be missing with no signal.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {saved ? (
            <Button variant="secondary" size="sm" onClick={handleRemove}>
              <Trash2 className="size-4" />
              Remove download
            </Button>
          ) : (
            <Button size="sm" onClick={handleSave} disabled={downloading || !online}>
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CloudDownload className="size-4" />
              )}
              {downloading ? "Saving…" : "Save for offline"}
            </Button>
          )}
        </div>
      </div>

      {downloading && (
        <div className="mt-4">
          <Progress value={progress ?? 0} />
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {progress}% · downloading map tiles
          </p>
        </div>
      )}
    </div>
  );
}
