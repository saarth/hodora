import { useEffect, useRef } from "react";
import { Maximize2 } from "lucide-react";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { buildCyclingStyle, setVectorBasemapTheme } from "@/lib/cycling-style";
import { haversine, splitBySegments, type RidePoint } from "@/lib/gpx";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Optional: set VITE_MAPTILER_KEY to swap the default raster CARTO basemap
// for a custom cycling-focused vector style (see src/lib/cycling-style.ts).
// Leaving it unset keeps the app's zero-config, self-hosting-friendly default.
const maptilerKey = (import.meta.env.VITE_MAPTILER_KEY as string | undefined)?.trim();
const useVectorBasemap = Boolean(maptilerKey);

type LivePosition = {
  lat: number;
  lon: number;
  heading?: number | null;
};

type RouteMapProps = {
  points: RidePoint[];
  className?: string;
  live?: LivePosition | null;
  /** keep the live position centered */
  follow?: boolean;
  /** progress marker along the route (index into points) */
  progressIndex?: number | null;
  interactive?: boolean;
  /** map tilt in degrees: 0 = birds-eye, ~60 = angled */
  pitch?: number;
  /** dashed guide line from the live position to the closest route point */
  rejoin?: { lat: number; lon: number } | null;
  /** bike-friendly path back to the track; falls back to a straight dashed line */
  rejoinPath?: { lat: number; lon: number }[] | null;

  /** bump `nonce` to fit the camera around the given coordinates */
  fitTo?: { coords: { lat: number; lon: number }[]; nonce: number } | null;
  /** show the "Fit route" button overlay (off during turn-by-turn navigation) */
  showFitControl?: boolean;
  /** starting camera position when there is no route yet */
  initialCenter?: { lat: number; lon: number } | null;
  /** bump `nonce` to move the camera to a point (explore / locate me) */
  flyTo?: { lat: number; lon: number; zoom?: number; nonce: number } | null;
  /** reports the visible area after the user pans or zooms */
  onViewChange?: (view: { center: { lat: number; lon: number }; radiusM: number }) => void;
  /** points to mark on the map that aren't part of a drawn route yet, e.g. route-planner clicks */
  waypoints?: { lat: number; lon: number }[] | null;
  /** fires with the clicked map coordinate; used by the route planner to add waypoints and to place ride notes */
  onMapClick?: (point: { lat: number; lon: number }) => void;
  /** rider-authored notes pinned along the route */
  notes?: { id: string; lat: number; lon: number }[] | null;
};

const basemap = (theme: "light" | "dark") =>
  theme === "dark"
    ? "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"
    : "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png";

function parsePercentOrNumber(value: string, hundredPercent: number): number {
  return value.endsWith("%") ? (parseFloat(value) / 100) * hundredPercent : Number(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function linearToSrgb(value: number): number {
  const c = clamp01(value);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

// Converts a CSS `oklch(L C H[ / A])` string to an `rgba()` string using the
// standard OKLab matrices (Björn Ottosson), entirely in JS with no DOM or
// Canvas involved. MapLibre's paint-property color parser only understands
// rgb()/hex/hsl, not oklch(), so this can't just be handed through — and a
// Canvas-2D round-trip conversion (fillStyle + getImageData) turned out to
// be unreliable in the wild: privacy-hardened browsers (Brave's
// fingerprinting protection, Firefox's resistFingerprinting, etc.) block or
// randomize Canvas pixel readback specifically to stop canvas
// fingerprinting, which silently defeated that approach and let the raw
// oklch() string back through, failing every addLayer call.
function oklchToRgbaString(oklch: string): string | null {
  const match = oklch.match(
    /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/i,
  );
  if (!match) return null;

  const L = parsePercentOrNumber(match[1], 1);
  const C = parsePercentOrNumber(match[2], 0.4);
  const H = (Number(match[3]) * Math.PI) / 180;
  const alpha = match[4] !== undefined ? parsePercentOrNumber(match[4], 1) : 1;

  const a = C * Math.cos(H);
  const b = C * Math.sin(H);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const rLinear = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLinear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLinear = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const r = Math.round(linearToSrgb(rLinear) * 255);
  const g = Math.round(linearToSrgb(gLinear) * 255);
  const bComp = Math.round(linearToSrgb(bLinear) * 255);

  return `rgba(${r}, ${g}, ${bComp}, ${alpha.toFixed(3)})`;
}

// MapLibre paint properties need real color strings, not `var(...)` — it
// paints to a canvas, not the DOM.
//
// This used to go through a hidden probe element: set `color: var(--x)` on
// it, then read back `getComputedStyle(probe).color`. That round-trip is
// fragile — it depends on how each browser *serializes a resolved <color>
// property*, and that serialization has changed (and differed between
// Chromium and Firefox) more than once, each time silently dropping every
// addLayer() call for the route/casing/endpoints with no thrown error (see
// git history: "Fix route not rendering on the map").
//
// Custom properties don't have that problem. Per the CSS spec, the computed
// value of a custom property is just its declared token text with nested
// var() references substituted in — it is never re-serialized as a typed
// <color>. Reading `--color-route` straight off <html> (where the "dark"
// class is toggled) returns exactly what styles.css wrote, e.g.
// "oklch(0.62 0.19 145)", regardless of browser or version.
function resolveThemeColor(varName: string): string {
  if (typeof document === "undefined") return "#000000";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();

  // MapLibre's paint-property color parser only understands rgb()/hex/hsl,
  // not oklch(), so this still needs converting before it reaches addLayer.
  if (raw.startsWith("oklch(")) {
    const converted = oklchToRgbaString(raw);
    if (converted) return converted;
  }
  return raw || "#000000";
}

function mapThemeColors() {
  return {
    route: resolveThemeColor("--color-route"),
    background: resolveThemeColor("--color-background"),
    mutedForeground: resolveThemeColor("--color-muted-foreground"),
    warning: resolveThemeColor("--color-warning"),
    foreground: resolveThemeColor("--color-foreground"),
    chart2: resolveThemeColor("--color-chart-2"),
  };
}

function applyThemeColors(map: any, colors: ReturnType<typeof mapThemeColors>) {
  if (map.getLayer("route-casing")) {
    map.setPaintProperty("route-casing", "line-color", colors.background);
  }
  if (map.getLayer("route-line")) {
    map.setPaintProperty("route-line", "line-color", colors.route);
  }
  if (map.getLayer("route-done-line")) {
    map.setPaintProperty("route-done-line", "line-color", colors.mutedForeground);
  }
  if (map.getLayer("rejoin-line")) {
    map.setPaintProperty("rejoin-line", "line-color", colors.warning);
  }
  if (map.getLayer("rejoin-point-layer")) {
    map.setPaintProperty("rejoin-point-layer", "circle-color", colors.warning);
    map.setPaintProperty("rejoin-point-layer", "circle-stroke-color", colors.background);
  }
  if (map.getLayer("endpoints-layer")) {
    map.setPaintProperty("endpoints-layer", "circle-color", [
      "match",
      ["get", "kind"],
      "start",
      colors.route,
      colors.foreground,
    ]);
    map.setPaintProperty("endpoints-layer", "circle-stroke-color", colors.background);
  }
  if (map.getLayer("waypoints-layer")) {
    map.setPaintProperty("waypoints-layer", "circle-color", [
      "match",
      ["get", "role"],
      "start",
      colors.route,
      "end",
      colors.foreground,
      colors.warning,
    ]);
    map.setPaintProperty("waypoints-layer", "circle-stroke-color", colors.background);
  }
  if (map.getLayer("notes-layer")) {
    map.setPaintProperty("notes-layer", "circle-color", colors.chart2);
    map.setPaintProperty("notes-layer", "circle-stroke-color", colors.background);
  }
}

export function RouteMap({
  points,
  className,
  live = null,
  follow = false,
  progressIndex = null,
  interactive = true,
  pitch = 0,
  rejoin = null,
  rejoinPath = null,

  fitTo = null,
  showFitControl = true,
  initialCenter = null,
  flyTo = null,
  onViewChange,
  waypoints = null,
  onMapClick,
  notes = null,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const libRef = useRef<any>(null);
  const readyRef = useRef(false);
  const pointsRef = useRef<RidePoint[]>(points);
  pointsRef.current = points;
  const pitchRef = useRef(pitch);
  pitchRef.current = pitch;
  const riderMarkerRef = useRef<any>(null);
  const viewChangeRef = useRef(onViewChange);
  viewChangeRef.current = onViewChange;
  const mapClickRef = useRef(onMapClick);
  mapClickRef.current = onMapClick;
  const waypointsRef = useRef(waypoints);
  waypointsRef.current = waypoints;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const { theme } = useTheme();

  // Boot the map once, client side only.
  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      const [lib] = await Promise.all([
        import("maplibre-gl"),
        import("maplibre-gl/dist/maplibre-gl.css"),
      ]);
      if (cancelled || !containerRef.current) return;

      const maplibre: any = (lib as any).default ?? lib;
      // MapLibre resolves this worker dynamically, which means Vite cannot
      // discover and package its runtime shared module automatically. Copy the
      // shared module explicitly during the build so the worker finds it.
      maplibre.setWorkerUrl(maplibreWorkerUrl);
      libRef.current = maplibre;

      const map = new maplibre.Map({
        container: containerRef.current,
        style: useVectorBasemap
          ? buildCyclingStyle(theme, maptilerKey!)
          : {
              version: 8,
              sources: {
                basemap: {
                  type: "raster",
                  tiles: [basemap(theme)],
                  tileSize: 256,
                  attribution:
                    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
                },
              },
              layers: [{ id: "basemap", type: "raster", source: "basemap" }],
            },
        center: [
          points[0]?.lon ?? initialCenter?.lon ?? 0,
          points[0]?.lat ?? initialCenter?.lat ?? 0,
        ],
        zoom: 12,
        pitch,
        attributionControl: { compact: true },
        interactive,
      });

      if (interactive) {
        map.addControl(
          new maplibre.NavigationControl({ showCompass: true, visualizePitch: true }),
          "top-right",
        );
        // Explicit gesture setup: wheel/pinch zoom, drag pan, double-tap zoom,
        // and keyboard arrows all stay enabled on touch and desktop.
        map.scrollZoom.enable();
        map.boxZoom.enable();
        map.dragPan.enable();
        map.doubleClickZoom.enable();
        map.keyboard.enable();
        map.touchZoomRotate.enable({ around: "center" });
        map.touchPitch.enable();
      }

      map.on("load", () => {
        if (cancelled) return;
        readyRef.current = true;
        const current = pointsRef.current;
        drawRoute(map, current);
        setupWaypointsLayer(map, waypointsRef.current ?? []);
        setupNotesLayer(map, notesRef.current ?? []);
        // Show the complete route until the first live GPS fix takes over.
        if (current.length > 1) fitRoute(map, current, 48);
        // Some browsers can report their final size after MapLibre's initial
        // layout pass. Recalculate once the view has settled.
        requestAnimationFrame(() => map.resize());
      });

      map.on("click", (event: any) => {
        mapClickRef.current?.({ lat: event.lngLat.lat, lon: event.lngLat.lng });
      });

      map.on("moveend", () => {
        const handler = viewChangeRef.current;
        if (!handler) return;
        const center = map.getCenter();
        const bounds = map.getBounds();
        const nw = bounds.getNorthWest();
        const radiusM = (haversine(nw.lat, nw.lng, center.lat, center.lng) as number) * 0.9;
        handler({ center: { lat: center.lat, lon: center.lng }, radiusM });
      });

      resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(containerRef.current);

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      readyRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap basemap tiles/layers and re-resolve route/endpoint colors when the theme changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (useVectorBasemap) {
      setVectorBasemapTheme(map, theme);
    } else {
      const source = map.getSource("basemap");
      if (source?.setTiles) source.setTiles([basemap(theme)]);
    }
    applyThemeColors(map, mapThemeColors());
  }, [theme]);

  // Move the camera to an explicit point (locate me, explore results).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    map.flyTo({ center: [flyTo.lon, flyTo.lat], zoom: flyTo.zoom ?? 12, duration: 800 });
  }, [flyTo?.nonce]);

  // Tilt the camera when the view mode changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch, duration: 500 });
  }, [pitch]);

  // Redraw when the route changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || points.length === 0) return;
    drawRoute(map, points);
    fitRoute(map, points, follow ? 0 : 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // Progress marker: dim what's already ridden.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const done = progressIndex && progressIndex > 1 ? points.slice(0, progressIndex + 1) : [];
    const source = map.getSource("route-done");
    if (source) {
      source.setData(lineFeature(done));
    }
  }, [progressIndex, points]);

  // Live rider marker.
  useEffect(() => {
    const map = mapRef.current;
    const maplibre = libRef.current;
    if (!map || !maplibre || !readyRef.current) return;

    if (!live) {
      riderMarkerRef.current?.remove();
      riderMarkerRef.current = null;
      return;
    }

    if (!riderMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "rider-dot";
      el.innerHTML = '<span class="rider-dot__pulse"></span><span class="rider-dot__core"></span>';
      riderMarkerRef.current = new maplibre.Marker({ element: el })
        .setLngLat([live.lon, live.lat])
        .addTo(map);
    } else {
      riderMarkerRef.current.setLngLat([live.lon, live.lat]);
    }

    if (follow) {
      map.easeTo({
        center: [live.lon, live.lat],
        zoom: Math.max(map.getZoom(), 15.5),
        bearing: typeof live.heading === "number" ? live.heading : map.getBearing(),
        pitch: pitchRef.current,
        duration: 700,
      });
    }
  }, [live, follow]);

  // Off-route guide: dashed line from the rider to the closest route point.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource("rejoin");
    const pointSource = map.getSource("rejoin-point");
    if (!source || !pointSource) return;

    if (!live || !rejoin) {
      source.setData({ type: "FeatureCollection", features: [] });
      pointSource.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const routed = (rejoinPath?.length ?? 0) >= 2;
    const coordinates = routed
      ? rejoinPath!.map((p) => [p.lon, p.lat])
      : [
          [live.lon, live.lat],
          [rejoin.lon, rejoin.lat],
        ];

    // A real cycling path is drawn solid; the straight-line fallback stays dashed.
    if (map.getLayer("rejoin-line")) {
      map.setPaintProperty("rejoin-line", "line-dasharray", routed ? [1, 0] : [1.5, 1.5]);
      map.setPaintProperty("rejoin-line", "line-width", routed ? 5 : 3.5);
    }

    source.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    });

    pointSource.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [rejoin.lon, rejoin.lat] },
    });
  }, [live, rejoin, rejoinPath]);

  // Route-planner waypoint markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource("waypoints");
    if (source) source.setData(waypointsFeatureCollection(waypoints ?? []));
  }, [waypoints]);

  // Rider-authored note pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource("notes");
    if (source) source.setData(notesFeatureCollection(notes ?? []));
  }, [notes]);

  // Fit the camera around an explicit set of coordinates on demand.
  const fitCoordsRef = useRef(fitTo?.coords ?? []);
  fitCoordsRef.current = fitTo?.coords ?? [];
  useEffect(() => {
    const map = mapRef.current;
    const maplibre = libRef.current;
    const coords = fitCoordsRef.current;
    if (!map || !maplibre || !readyRef.current || coords.length === 0) return;
    const bounds = coords.reduce(
      (acc, c) => acc.extend([c.lon, c.lat]),
      new maplibre.LngLatBounds([coords[0].lon, coords[0].lat], [coords[0].lon, coords[0].lat]),
    );
    map.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTo?.nonce]);

  const fitWholeRoute = () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.easeTo({ bearing: 0, duration: 300 });
    fitRoute(map, pointsRef.current, 48);
  };

  return (
    <div className={cn("map-shell relative overflow-hidden", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {interactive && showFitControl && points.length > 1 ? (
        <button
          type="button"
          onClick={fitWholeRoute}
          aria-label="Fit route to view"
          title="Fit route to view"
          className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur transition hover:bg-card"
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          Fit route
        </button>
      ) : null}
    </div>
  );
}

function lineFeature(points: RidePoint[]) {
  // A GeoJSON LineString must contain at least two coordinates. MapLibre 6
  // rejects an empty LineString, which previously stopped drawRoute before
  // any route layers were added on Android. Segments are split at `gap`
  // markers (real breaks between GPX <trkseg>s) so the line doesn't bridge
  // across them.
  const lines = splitBySegments(points)
    .filter((seg) => seg.length >= 2)
    .map((seg) => seg.map((p) => [p.lon, p.lat]));
  if (lines.length === 0) {
    return {
      type: "FeatureCollection" as const,
      features: [],
    };
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "MultiLineString" as const,
      coordinates: lines,
    },
  };
}

function drawRoute(map: any, points: RidePoint[]) {
  const routeData = lineFeature(points);

  if (map.getSource("route")) {
    map.getSource("route").setData(routeData);
    updateEndpoints(map, points);
    return;
  }

  map.addSource("route", { type: "geojson", data: routeData });

  const colors = mapThemeColors();

  map.addLayer({
    id: "route-casing",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.background, "line-width": 8, "line-opacity": 0.45 },
  });
  map.addLayer({
    id: "route-line",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.route, "line-width": 4.5 },
  });
  map.addSource("route-done", { type: "geojson", data: lineFeature([]) });
  map.addLayer({
    id: "route-done-line",
    type: "line",
    source: "route-done",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.mutedForeground, "line-width": 4.5, "line-opacity": 0.9 },
  });

  const empty = { type: "FeatureCollection" as const, features: [] };
  map.addSource("rejoin", { type: "geojson", data: empty });
  map.addLayer({
    id: "rejoin-line",
    type: "line",
    source: "rejoin",
    layout: { "line-cap": "round" },
    paint: {
      "line-color": colors.warning,
      "line-width": 3.5,
      "line-dasharray": [1.5, 1.5],
    },
  });
  map.addSource("rejoin-point", { type: "geojson", data: empty });
  map.addLayer({
    id: "rejoin-point-layer",
    type: "circle",
    source: "rejoin-point",
    paint: {
      "circle-radius": 7,
      "circle-color": colors.warning,
      "circle-stroke-width": 2.5,
      "circle-stroke-color": colors.background,
    },
  });

  map.addSource("endpoints", {
    type: "geojson",
    data: endpointData(points),
  });
  map.addLayer({
    id: "endpoints-layer",
    type: "circle",
    source: "endpoints",
    paint: {
      "circle-radius": 6,
      "circle-color": ["match", ["get", "kind"], "start", colors.route, colors.foreground],
      "circle-stroke-width": 2.5,
      "circle-stroke-color": colors.background,
    },
  });
}

function endpointData(points: RidePoint[]) {
  const start = points[0];
  const end = points[points.length - 1];
  return {
    type: "FeatureCollection" as const,
    features:
      start && end
        ? [
            {
              type: "Feature" as const,
              properties: { kind: "start" },
              geometry: { type: "Point" as const, coordinates: [start.lon, start.lat] },
            },
            {
              type: "Feature" as const,
              properties: { kind: "finish" },
              geometry: { type: "Point" as const, coordinates: [end.lon, end.lat] },
            },
          ]
        : [],
  };
}

function waypointsFeatureCollection(waypoints: { lat: number; lon: number }[]) {
  return {
    type: "FeatureCollection" as const,
    features: waypoints.map((point, index) => ({
      type: "Feature" as const,
      properties: {
        role: index === 0 ? "start" : index === waypoints.length - 1 ? "end" : "via",
      },
      geometry: { type: "Point" as const, coordinates: [point.lon, point.lat] },
    })),
  };
}

/** Route-planner click markers — independent of the routed line, so a single tapped point still shows up. */
function setupWaypointsLayer(map: any, waypoints: { lat: number; lon: number }[]) {
  if (map.getSource("waypoints")) return;
  const colors = mapThemeColors();
  map.addSource("waypoints", { type: "geojson", data: waypointsFeatureCollection(waypoints) });
  map.addLayer({
    id: "waypoints-layer",
    type: "circle",
    source: "waypoints",
    paint: {
      "circle-radius": ["match", ["get", "role"], "via", 5, 7],
      "circle-color": ["match", ["get", "role"], "start", colors.route, "end", colors.foreground, colors.warning],
      "circle-stroke-width": 2.5,
      "circle-stroke-color": colors.background,
    },
  });
}

function notesFeatureCollection(notes: { id: string; lat: number; lon: number }[]) {
  return {
    type: "FeatureCollection" as const,
    features: notes.map((note) => ({
      type: "Feature" as const,
      properties: { id: note.id },
      geometry: { type: "Point" as const, coordinates: [note.lon, note.lat] },
    })),
  };
}

/** Rider-authored note pins — a distinct color from route/waypoint/endpoint markers so they read as annotations, not navigation geometry. */
function setupNotesLayer(map: any, notes: { id: string; lat: number; lon: number }[]) {
  if (map.getSource("notes")) return;
  const colors = mapThemeColors();
  map.addSource("notes", { type: "geojson", data: notesFeatureCollection(notes) });
  map.addLayer({
    id: "notes-layer",
    type: "circle",
    source: "notes",
    paint: {
      "circle-radius": 6,
      "circle-color": colors.chart2,
      "circle-stroke-width": 2.5,
      "circle-stroke-color": colors.background,
    },
  });
}

function updateEndpoints(map: any, points: RidePoint[]) {
  const source = map.getSource("endpoints");
  if (source) {
    source.setData(endpointData(points));
  }
}

function fitRoute(map: any, points: RidePoint[], padding: number) {
  if (points.length === 0 || padding === 0) return;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLon = points[0].lon;
  let maxLon = points[0].lon;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  map.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    { padding, duration: 0 },
  );
}
