/**
 * Custom cycling-focused MapLibre vector style, built against MapTiler's
 * OpenMapTiles-schema vector tiles. Inspired by CyclOSM's visual language
 * (dedicated cycle infrastructure gets its own color, unpaved tracks/paths
 * are dashed, the base map stays muted) — not a port of CyclOSM itself,
 * since CyclOSM is a Mapnik/CartoCSS raster style and has no vector
 * equivalent to import.
 *
 * Both a light and a dark layer set are baked into the same style so
 * switching themes only needs `setLayoutProperty("visibility", ...)`
 * (see `setVectorBasemapTheme`) instead of a full `map.setStyle()`, which
 * would tear down and require re-adding every route/marker layer on top.
 *
 * Layer/filter objects are typed loosely (`any`) rather than against
 * MapLibre's exact expression-spec types: those types only accept `as const`
 * tuples, which would make every filter/paint expression below far more
 * verbose for no runtime benefit — same tradeoff RouteMap.tsx makes for the
 * `Map` instance itself.
 */

export type MapTheme = "light" | "dark";

const ATTRIBUTION =
  '© <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors';

type Palette = {
  background: string;
  water: string;
  wood: string;
  grass: string;
  wetland: string;
  sand: string;
  ice: string;
  park: string;
  residential: string;
  commercial: string;
  industrial: string;
  building: string;
  boundary: string;
  motorwayFill: string;
  motorwayCasing: string;
  primaryFill: string;
  primaryCasing: string;
  secondaryFill: string;
  secondaryCasing: string;
  minorFill: string;
  minorCasing: string;
  track: string;
  path: string;
  cycleway: string;
  cyclewayCasing: string;
  labelText: string;
  labelHalo: string;
  roadLabelText: string;
  roadLabelHalo: string;
};

const PALETTES: Record<MapTheme, Palette> = {
  light: {
    background: "#f7f3e8",
    water: "#aad3df",
    wood: "#c8e2ae",
    grass: "#d7ecc0",
    wetland: "#bfe0d6",
    sand: "#f2e6c9",
    ice: "#eef3f5",
    park: "#c9e6ae",
    residential: "#ece8dc",
    commercial: "#ece3df",
    industrial: "#e6e1d8",
    building: "#ddd2c0",
    boundary: "#b49bc0",
    motorwayFill: "#ffcb7d",
    motorwayCasing: "#e08a3c",
    primaryFill: "#ffe59b",
    primaryCasing: "#dcb35c",
    secondaryFill: "#ffffff",
    secondaryCasing: "#d8cdb8",
    minorFill: "#ffffff",
    minorCasing: "#ddd6c6",
    track: "#a9835a",
    path: "#8f8574",
    cycleway: "#1f7fd1",
    cyclewayCasing: "#ffffff",
    labelText: "#3a352c",
    labelHalo: "#f7f3e8",
    roadLabelText: "#54493a",
    roadLabelHalo: "#ffffff",
  },
  dark: {
    background: "#191c1f",
    water: "#17303f",
    wood: "#1f2b20",
    grass: "#232b1e",
    wetland: "#1b2f30",
    sand: "#2b2a22",
    ice: "#24282b",
    park: "#22301f",
    residential: "#212327",
    commercial: "#22242a",
    industrial: "#232529",
    building: "#2a2d33",
    boundary: "#4c4a5e",
    motorwayFill: "#b3583d",
    motorwayCasing: "#7a3324",
    primaryFill: "#8c6b3d",
    primaryCasing: "#5f4b2c",
    secondaryFill: "#3c3f46",
    secondaryCasing: "#2a2c31",
    minorFill: "#2e3136",
    minorCasing: "#24262b",
    track: "#6f5c44",
    path: "#5d5f66",
    cycleway: "#4da3ff",
    cyclewayCasing: "#173250",
    labelText: "#d7d9dc",
    labelHalo: "#15171a",
    roadLabelText: "#c3c6cb",
    roadLabelHalo: "#15171a",
  },
};

/** Builds every basemap layer for one theme, id-prefixed and hidden unless `visible`. */
function themeLayers(theme: MapTheme, visible: boolean): any[] {
  const p = PALETTES[theme];
  const id = (name: string) => `bm-${theme}-${name}`;
  const visibility = visible ? "visible" : "none";
  const layout = { visibility } as const;

  const isPath = ["==", ["get", "class"], "path"] as const;
  const isCycleway = ["all", isPath, ["==", ["get", "subclass"], "cycleway"]];
  const isFootpath = ["all", isPath, ["!=", ["get", "subclass"], "cycleway"]];

  return [
    {
      id: id("background"),
      type: "background",
      paint: { "background-color": p.background },
      layout,
    },
    {
      id: id("landcover"),
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      paint: {
        "fill-color": [
          "match",
          ["get", "class"],
          "wood",
          p.wood,
          "grass",
          p.grass,
          "grassland",
          p.grass,
          "scrub",
          p.grass,
          "wetland",
          p.wetland,
          "sand",
          p.sand,
          "ice",
          p.ice,
          "glacier",
          p.ice,
          "rgba(0,0,0,0)",
        ],
        "fill-opacity": 0.7,
      },
      layout,
    },
    {
      id: id("landuse"),
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      paint: {
        "fill-color": [
          "match",
          ["get", "class"],
          "residential",
          p.residential,
          "suburb",
          p.residential,
          "neighbourhood",
          p.residential,
          "commercial",
          p.commercial,
          "retail",
          p.commercial,
          "industrial",
          p.industrial,
          "rgba(0,0,0,0)",
        ],
        "fill-opacity": 0.6,
      },
      layout,
    },
    {
      id: id("park"),
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      paint: { "fill-color": p.park, "fill-opacity": 0.55 },
      layout,
    },
    {
      id: id("water"),
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": p.water },
      layout,
    },
    {
      id: id("waterway"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: {
        "line-color": p.water,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 16, 2.5],
      },
      layout,
    },
    {
      id: id("building"),
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 14,
      paint: { "fill-color": p.building, "fill-opacity": 0.8 },
      layout,
    },
    {
      id: id("boundary"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["<=", ["get", "admin_level"], 4],
      paint: {
        "line-color": p.boundary,
        "line-width": ["match", ["get", "admin_level"], 2, 1.6, 0.8],
        "line-dasharray": [3, 2],
        "line-opacity": 0.7,
      },
      layout,
    },

    // Unpaved tracks — dashed, cycling relevant (gravel/dirt).
    {
      id: id("road-track"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["==", ["get", "class"], "track"],
      minzoom: 12,
      layout: { ...layout, "line-cap": "round" },
      paint: {
        "line-color": p.track,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 17, 2],
        "line-dasharray": [2, 1.5],
      },
    },
    // Footways / bridleways / steps — thin dashed.
    {
      id: id("road-path"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: isFootpath,
      minzoom: 13,
      layout: { ...layout, "line-cap": "round" },
      paint: {
        "line-color": p.path,
        "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.6, 17, 1.8],
        "line-dasharray": [1, 1.4],
      },
    },
    // Minor / service roads.
    {
      id: id("road-minor-casing"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["minor", "service"]]],
      minzoom: 13,
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.minorCasing,
        "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1, 18, 8],
      },
    },
    {
      id: id("road-minor"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["minor", "service"]]],
      minzoom: 13,
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.minorFill,
        "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.4, 18, 6],
      },
    },
    // Secondary / tertiary roads.
    {
      id: id("road-secondary-casing"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
      minzoom: 9,
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.secondaryCasing,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 18, 10],
      },
    },
    {
      id: id("road-secondary"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
      minzoom: 9,
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.secondaryFill,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 18, 8],
      },
    },
    // Primary roads.
    {
      id: id("road-primary-casing"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["==", ["get", "class"], "primary"],
      minzoom: 7,
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.primaryCasing,
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1, 18, 12],
      },
    },
    {
      id: id("road-primary"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["==", ["get", "class"], "primary"],
      minzoom: 7,
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.primaryFill,
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.6, 18, 9],
      },
    },
    // Trunk / motorway.
    {
      id: id("road-motorway-casing"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk"]]],
      minzoom: 5,
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.motorwayCasing,
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 18, 14],
      },
    },
    {
      id: id("road-motorway"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk"]]],
      minzoom: 5,
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.motorwayFill,
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 18, 11],
      },
    },
    // Dedicated cycleways — drawn last among roads so they always stand out.
    {
      id: id("road-cycleway-casing"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: isCycleway,
      minzoom: 11,
      layout: { ...layout, "line-cap": "round" },
      paint: {
        "line-color": p.cyclewayCasing,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.4, 18, 6],
      },
    },
    {
      id: id("road-cycleway"),
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: isCycleway,
      minzoom: 11,
      layout: { ...layout, "line-cap": "round" },
      paint: {
        "line-color": p.cycleway,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 18, 3.5],
      },
    },

    // Labels.
    {
      id: id("road-label"),
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      filter: [
        "in",
        ["get", "class"],
        ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary"]],
      ],
      minzoom: 11,
      layout: {
        ...layout,
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
      },
      paint: {
        "text-color": p.roadLabelText,
        "text-halo-color": p.roadLabelHalo,
        "text-halo-width": 1.2,
      },
    },
    {
      id: id("place-label"),
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      filter: [
        "in",
        ["get", "class"],
        ["literal", ["city", "town", "village", "suburb", "hamlet"]],
      ],
      minzoom: 3,
      layout: {
        ...layout,
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["match", ["get", "class"], "city", 15, "town", 13, "village", 11.5, 10],
        "text-transform": "none",
      },
      paint: {
        "text-color": p.labelText,
        "text-halo-color": p.labelHalo,
        "text-halo-width": 1.4,
      },
    },
  ];
}

/** Builds the full style: both themes' layers baked in, only one set visible. */
export function buildCyclingStyle(theme: MapTheme, maptilerKey: string): any {
  return {
    version: 8,
    glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${maptilerKey}`,
    sources: {
      openmaptiles: {
        type: "vector",
        tiles: [`https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${maptilerKey}`],
        maxzoom: 14,
        attribution: ATTRIBUTION,
      },
    },
    layers: [...themeLayers("light", theme === "light"), ...themeLayers("dark", theme === "dark")],
  };
}

/** Swaps which theme's basemap layers are visible without tearing down the style (setStyle would remove every route/marker layer added on top). */
export function setVectorBasemapTheme(map: any, theme: MapTheme) {
  const layers: { id: string }[] = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    if (!layer.id.startsWith("bm-light-") && !layer.id.startsWith("bm-dark-")) continue;
    const isActive = layer.id.startsWith(`bm-${theme}-`);
    map.setLayoutProperty(layer.id, "visibility", isActive ? "visible" : "none");
  }
}
