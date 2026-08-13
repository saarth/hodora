import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Gauge,
  Layers,
  MapPin,
  MapPinPlus,
  Navigation,
  StickyNote,
  Trash2,
  TrendingDown,
  TrendingUp,
  Ruler,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { RouteMap } from "@/components/RouteMap";
import { ElevationChart } from "@/components/ElevationChart";
import { OfflineSaveCard } from "@/components/OfflineSaveCard";
import { DIFFICULTY_OPTIONS, SURFACE_OPTIONS } from "@/components/RideTags";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { directionsUrl, formatDistance, formatElevation } from "@/lib/gpx";
import { snapToRoute } from "@/lib/nav";
import {
  fetchProfile,
  fetchRide,
  ridesKeys,
  updateRideNotes,
  updateRideTags,
  type Ride,
  type RideDifficulty,
  type RideNote,
  type RideSurface,
} from "@/lib/rides";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rides/$id/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Route details — Hodora" },
      {
        name: "description",
        content:
          "Route overview with map, elevation profile, distance and total climbing before you start navigating.",
      },
      { property: "og:title", content: "Route details — Hodora" },
      {
        property: "og:description",
        content: "Map, elevation profile and climbing for your imported GPX route.",
      },
    ],
  }),
  component: RideDetail,
});

function RideDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ridesKeys.profile, queryFn: fetchProfile });
  const metric = profile?.unit !== "imperial";
  const {
    data: ride,
    isLoading,
    error,
  } = useQuery({
    queryKey: ridesKeys.detail(id),
    queryFn: () => fetchRide(id),
  });

  const [addingNote, setAddingNote] = useState(false);
  const [pendingNote, setPendingNote] = useState<{
    lat: number;
    lon: number;
    distanceM: number;
  } | null>(null);
  const [noteText, setNoteText] = useState("");

  const tagsMutation = useMutation({
    mutationFn: (tags: { difficulty?: RideDifficulty | null; surface?: RideSurface | null }) =>
      updateRideTags(id, tags),
    onSuccess: (_result, tags) => {
      queryClient.setQueryData<Ride>(ridesKeys.detail(id), (prev) =>
        prev ? { ...prev, ...tags } : prev,
      );
      queryClient.invalidateQueries({ queryKey: ridesKeys.all });
    },
    onError: () => toast.error("Could not update that tag"),
  });

  const notesMutation = useMutation({
    mutationFn: (notes: RideNote[]) => updateRideNotes(id, notes),
    onSuccess: (_result, notes) => {
      queryClient.setQueryData<Ride>(ridesKeys.detail(id), (prev) =>
        prev ? { ...prev, notes } : prev,
      );
    },
    onError: () => toast.error("Could not save that note"),
  });

  function handleMapClick(point: { lat: number; lon: number }) {
    if (!addingNote || !ride) return;
    const snap = snapToRoute(ride.points, point.lat, point.lon);
    setAddingNote(false);
    setPendingNote({ lat: snap.lat, lon: snap.lon, distanceM: snap.progressM });
  }

  function saveNote() {
    if (!ride || !pendingNote || !noteText.trim()) return;
    const note: RideNote = {
      id: crypto.randomUUID(),
      distanceM: pendingNote.distanceM,
      lat: pendingNote.lat,
      lon: pendingNote.lon,
      text: noteText.trim(),
      createdAt: new Date().toISOString(),
    };
    const notes = [...(ride.notes ?? []), note].sort((a, b) => a.distanceM - b.distanceM);
    notesMutation.mutate(notes);
    setPendingNote(null);
    setNoteText("");
  }

  function deleteNote(noteId: string) {
    if (!ride) return;
    notesMutation.mutate((ride.notes ?? []).filter((note) => note.id !== noteId));
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/rides">
            <ArrowLeft className="size-4" />
            All rides
          </Link>
        </Button>

        {isLoading && <Skeleton className="mt-6 h-[420px] rounded-2xl" />}
        {error && <p className="mt-8 text-sm text-destructive">That route couldn't be loaded.</p>}

        {ride && (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">{ride.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Imported {new Date(ride.created_at).toLocaleDateString()}
                  {ride.source_filename ? ` · ${ride.source_filename}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ride.points.length > 0 && (
                  <Button asChild variant="secondary" size="lg">
                    <a
                      href={directionsUrl(ride.points[0].lat, ride.points[0].lon)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MapPin className="size-4" />
                      Directions to start
                    </a>
                  </Button>
                )}
                <Button asChild size="lg" className="glow-ring">
                  <Link to="/rides/$id/nav" params={{ id: ride.id }}>
                    <Navigation className="size-4" />
                    Start navigation
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Stat icon={Ruler} label="Distance" value={formatDistance(ride.distance_m, metric)} />
              <Stat
                icon={TrendingUp}
                label="Ascent"
                value={formatElevation(ride.ascent_m, metric)}
              />
              <Stat
                icon={TrendingDown}
                label="Descent"
                value={formatElevation(ride.descent_m, metric)}
              />
            </div>

            <div className="surface relative mt-4 overflow-hidden">
              <RouteMap
                points={ride.points}
                className="h-[380px] w-full"
                notes={(ride.notes ?? []).map((note) => ({
                  id: note.id,
                  lat: note.lat,
                  lon: note.lon,
                }))}
                onMapClick={handleMapClick}
                showFitControl={!addingNote}
              />
              {addingNote && (
                <div className="glass-faint pointer-events-none absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs">
                  <span className="pointer-events-none">Tap the map to place a note</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="pointer-events-auto h-7 px-2 text-xs"
                    onClick={() => setAddingNote(false)}
                  >
                    <X className="size-3.5" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-4">
              <OfflineSaveCard ride={ride} />
            </div>

            <div className="surface mt-4 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Elevation
              </h2>
              <div className="mt-4">
                <ElevationChart points={ride.points} metric={metric} height={200} />
              </div>
            </div>

            <div className="surface mt-4 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Route info
              </h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div>
                  <span className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                    <Gauge className="size-3.5" />
                    Difficulty
                  </span>
                  <ToggleGroup
                    type="single"
                    value={ride.difficulty ?? ""}
                    onValueChange={(value) =>
                      tagsMutation.mutate({ difficulty: (value as RideDifficulty) || null })
                    }
                    className="mt-2 flex-wrap justify-start"
                  >
                    {DIFFICULTY_OPTIONS.map((option) => (
                      <ToggleGroupItem
                        key={option.value}
                        value={option.value}
                        variant="outline"
                        className={cn("px-3", option.toggleClass)}
                      >
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <div>
                  <span className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                    <Layers className="size-3.5" />
                    Surface
                  </span>
                  <ToggleGroup
                    type="single"
                    value={ride.surface ?? ""}
                    onValueChange={(value) =>
                      tagsMutation.mutate({ surface: (value as RideSurface) || null })
                    }
                    className="mt-2 flex-wrap justify-start"
                  >
                    {SURFACE_OPTIONS.map((option) => (
                      <ToggleGroupItem
                        key={option.value}
                        value={option.value}
                        variant="outline"
                        className="px-3"
                      >
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              </div>
            </div>

            <div className="surface mt-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  <StickyNote className="size-3.5" />
                  Notes
                </h2>
                <Button
                  size="sm"
                  variant={addingNote ? "default" : "secondary"}
                  onClick={() => setAddingNote((value) => !value)}
                >
                  <MapPinPlus className="size-4" />
                  {addingNote ? "Tap the map…" : "Add note"}
                </Button>
              </div>

              {(ride.notes ?? []).length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No notes yet — mark water stops, viewpoints or hazards along the route.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {(ride.notes ?? []).map((note) => (
                    <li
                      key={note.id}
                      className="flex items-start gap-3 rounded-xl border border-border p-3"
                    >
                      <span className="font-mono text-xs font-semibold text-primary">
                        {formatDistance(note.distanceM, metric)}
                      </span>
                      <p className="min-w-0 flex-1 text-sm">{note.text}</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="Delete note"
                        onClick={() => deleteNote(note.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </main>

      <Dialog
        open={pendingNote !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingNote(null);
            setNoteText("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a note</DialogTitle>
          </DialogHeader>
          <Textarea
            autoFocus
            placeholder="e.g. Water fountain here, or watch for gravel"
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            maxLength={280}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setPendingNote(null);
                setNoteText("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveNote} disabled={!noteText.trim() || notesMutation.isPending}>
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Ruler; label: string; value: string }) {
  return (
    <div className="surface p-4">
      <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <p className="mt-2 font-mono text-2xl font-bold">{value}</p>
    </div>
  );
}
