import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Mountain, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  downloadGpx,
  formatDistance,
  formatDuration,
  formatElevation,
  gpxFilename,
} from "@/lib/gpx";
import { fetchProfile, ridesKeys } from "@/lib/rides";
import {
  deleteRideSession,
  fetchRideSessions,
  sessionsKeys,
  type RideSession,
} from "@/lib/sessions";
import { weeklyStats } from "@/lib/stats";

export const Route = createFileRoute("/history")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ride history — Hodora" },
      {
        name: "description",
        content:
          "Weekly distance and elevation trends from your recorded rides, with GPX export of the actual tracks ridden.",
      },
      { property: "og:title", content: "Ride history — Hodora" },
      {
        property: "og:description",
        content: "Weekly distance and elevation trends from your recorded rides.",
      },
    ],
  }),
  component: HistoryPage,
});

function weekLabel(weekStart: string) {
  const [y, m, d] = weekStart.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function HistoryPage() {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ridesKeys.profile, queryFn: fetchProfile });
  const metric = profile?.unit !== "imperial";
  const { data: sessions, isLoading } = useQuery({
    queryKey: sessionsKeys.all,
    queryFn: fetchRideSessions,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRideSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionsKeys.all });
      toast.success("Ride removed from history");
    },
    onError: () => toast.error("Could not delete that ride"),
  });

  const weekly = useMemo(() => weeklyStats(sessions ?? [], 8), [sessions]);
  const chartData = useMemo(
    () =>
      weekly.map((w) => ({
        week: w.weekStart,
        distance: Math.round((metric ? w.distanceM / 1000 : w.distanceM / 1609.344) * 10) / 10,
      })),
    [weekly, metric],
  );

  const totals = useMemo(() => {
    if (!sessions?.length) return null;
    return {
      count: sessions.length,
      distance: sessions.reduce((sum, s) => sum + s.distance_m, 0),
      ascent: sessions.reduce((sum, s) => sum + s.ascent_m, 0),
    };
  }, [sessions]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Ride history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totals
              ? `${totals.count} recorded ride${totals.count === 1 ? "" : "s"} · ${formatDistance(totals.distance, metric)} · ${formatElevation(totals.ascent, metric)} climbed`
              : "Rides you navigate are recorded here automatically."}
          </p>
        </div>

        <div className="surface mt-6 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Weekly distance
          </h2>
          <div className="mt-4 h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="week"
                  tickFormatter={weekLabel}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  width={40}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "12px",
                    color: "var(--color-popover-foreground)",
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => weekLabel(String(v))}
                  formatter={(v) => [`${Number(v)} ${metric ? "km" : "mi"}`, "Distance"]}
                />
                <Bar dataKey="distance" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <section className="mt-6 grid gap-3">
          {isLoading && [0, 1, 2].map((key) => <Skeleton key={key} className="h-20 rounded-2xl" />)}

          {!isLoading && sessions?.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No rides recorded yet — start navigation on a route to build your history.
            </p>
          )}

          {sessions?.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              metric={metric}
              onDelete={() => deleteMutation.mutate(session.id)}
            />
          ))}
        </section>
      </main>
    </div>
  );
}

function SessionRow({
  session,
  metric,
  onDelete,
}: {
  session: RideSession;
  metric: boolean;
  onDelete: () => void;
}) {
  const durationS =
    (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000;

  return (
    <article className="surface flex min-w-0 items-center gap-4 p-4">
      <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary sm:flex">
        <Mountain className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        {session.ride_id ? (
          <Link
            to="/rides/$id"
            params={{ id: session.ride_id }}
            className="block truncate font-semibold hover:text-primary"
          >
            {session.ride_name}
          </Link>
        ) : (
          <span className="block truncate font-semibold">{session.ride_name}</span>
        )}
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {formatDistance(session.distance_m, metric)} · {formatElevation(session.ascent_m, metric)}{" "}
          up · {formatDuration(durationS)} · {new Date(session.started_at).toLocaleDateString()}
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          downloadGpx(
            { name: `${session.ride_name} (recorded)`, points: session.track },
            gpxFilename(session.ride_name, "-recorded"),
          )
        }
      >
        <Download className="size-3.5" />
        GPX
      </Button>
      <Button size="icon" variant="ghost" aria-label="Delete from history" onClick={onDelete}>
        <Trash2 className="size-4" />
      </Button>
    </article>
  );
}
