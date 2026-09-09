/**
 * A small procedurally generated corner of countryside — road network,
 * terrain, water, woods and villages — used to feed the screenshot run.
 *
 * The screenshots have to show a map, and the demo routes have to lie on
 * roads that actually exist on that map, so both come from the same
 * generated world: `layers` is served to MapLibre as OpenMapTiles-schema
 * vector tiles (see `tiles.mjs`), and `planRide` walks the very same road
 * graph to produce a route, its elevation profile and its cue sheet.
 *
 * Everything is derived from a seed, so a given seed always produces the
 * same world, the same routes and therefore the same screenshots.
 *
 * Place names are invented. This is deliberately not a real place: the app
 * UI in the screenshots is real, the geography behind it is a stand-in.
 */

/** Deterministic PRNG — same seed, same world. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const M_PER_DEG_LAT = 111320;

/** How far past the routed area the generated countryside keeps going. */
const OUTER_SCALE = 2.1;

/** Local east/north metre frame around a centre, and back to lon/lat. */
function makeFrame(center) {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  return {
    toLonLat: (x, y) => [center.lon + x / mPerDegLon, center.lat + y / M_PER_DEG_LAT],
    toXY: (lon, lat) => [(lon - center.lon) * mPerDegLon, (lat - center.lat) * M_PER_DEG_LAT],
  };
}

const VILLAGE_NAMES = [
  "Ashcombe",
  "Nether Marden",
  "Bramley Cross",
  "Wold Hinton",
  "Fenny Compton",
  "Upper Dray",
  "Stanbury",
  "Colde Ridge",
  "Marlow Green",
  "Thornby",
  "East Wyke",
  "Hollowbrook",
  "Sedge Barrow",
  "Cranmoor",
  "Kilnhurst",
  "Withy Bourne",
  "Draycott Magna",
  "Little Hinton",
  "Merrow End",
  "Pyecombe",
  "Steepleton",
  "Barrow Gurney",
  "Nether Wallop",
  "Chalk Newton",
  "Winterslade",
  "Broad Marsh",
  "Oakridge",
  "Tarrant Combe",
  "Hazelbury",
  "Shipton Bevis",
  "Yarnbury",
  "Duntisbourne",
  "Melbury Vale",
  "Ashen Cross",
  "Rookhaven",
  "Cold Ashton",
  "Barton Fleming",
  "Nethercote",
  "Wraxall",
  "Piddle Hinton",
  "Corscombe",
  "Ashley Chase",
  "Frome Belet",
  "Winterbourne Steep",
  "Hooke Green",
  "Toller Fratrum",
  "Compton Valence",
  "Sydling Magna",
  "Chilfrome",
  "Wynford Eagle",
  "Litton Cheney",
  "Puncknowle",
  "Askerswell",
  "Loders Cross",
  "Symondsbury",
  "Whitchurch Ash",
  "Powerstock",
  "Nettlecombe",
  "Milton Abbas",
];

const LANE_NAMES = [
  "Hollow Lane",
  "Mill Lane",
  "Barrow Road",
  "Cold Harbour Lane",
  "Church Lane",
  "Broad Oak Road",
  "Dray Hill",
  "Sheepwash Lane",
  "Long Furlong",
  "Kiln Road",
  "Withy Lane",
  "Beacon Hill Road",
  "Pound Lane",
  "Fosse Way",
  "Cranmoor Road",
  "Quarry Lane",
  "Bramble Hill",
  "Coombe Bottom",
  "Ridgeway Lane",
  "Old Toll Road",
  "Watery Lane",
  "Hangman's Hill",
  "Green Drove",
  "Puddleford Lane",
  "Stone Cross Road",
  "Harepath Lane",
  "Nine Acres",
  "Chalkpit Lane",
  "Sarsen Way",
  "Bell Tout Lane",
  "Elmfield Road",
  "Shepherd's Drove",
];

/**
 * Low-frequency noise in roughly [-1, 1], used to decide what covers the
 * ground. Independent per-field randomness produces a speckle that reads as
 * obviously computer-generated when zoomed out; noise this smooth clumps
 * fields into woods and pasture the way real land cover does.
 */
function makeCoverNoise(rand) {
  const waves = [];
  for (let i = 0; i < 4; i++) {
    const wavelength = 1800 + rand() * 5200;
    waves.push({
      k: (2 * Math.PI) / wavelength,
      angle: rand() * Math.PI * 2,
      phase: rand() * Math.PI * 2,
      weight: 1 / (i + 1.4),
    });
  }
  const total = waves.reduce((sum, w) => sum + w.weight, 0);
  return (x, y) => {
    let value = 0;
    for (const w of waves) {
      value += w.weight * Math.sin(w.k * (x * Math.cos(w.angle) + y * Math.sin(w.angle)) + w.phase);
    }
    return value / total;
  };
}

/** Smoothed multi-octave hills; returns metres above sea level. */
function makeTerrain(rand) {
  const waves = [];
  for (let i = 0; i < 8; i++) {
    const wavelength = 1400 + rand() * 11000;
    waves.push({
      k: (2 * Math.PI) / wavelength,
      angle: rand() * Math.PI * 2,
      phase: rand() * Math.PI * 2,
      amp: 4 + (wavelength / 11000) * 34,
    });
  }
  return (x, y) => {
    let h = 175;
    for (const w of waves) {
      h += w.amp * Math.sin(w.k * (x * Math.cos(w.angle) + y * Math.sin(w.angle)) + w.phase);
    }
    return Math.max(8, h);
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * A lane between two junctions, as a gently curved polyline rather than a
 * straight line — country roads bend, and a map of straight segments reads
 * as obviously synthetic.
 */
function curveBetween(a, b, rand) {
  const len = dist(a, b);
  const dx = (b.x - a.x) / len;
  const dy = (b.y - a.y) / len;
  const bow = (rand() - 0.5) * len * 0.22;
  const cx = (a.x + b.x) / 2 - dy * bow;
  const cy = (a.y + b.y) / 2 + dx * bow;
  const wiggleAmp = Math.min(70, len * 0.035);
  const wigglePhase = rand() * Math.PI * 2;
  const wiggleFreq = 2 + Math.floor(rand() * 3);

  const steps = Math.max(12, Math.round(len / 110));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    let px = mt * mt * a.x + 2 * mt * t * cx + t * t * b.x;
    let py = mt * mt * a.y + 2 * mt * t * cy + t * t * b.y;
    // Taper the wiggle to zero at both junctions so lanes still meet cleanly.
    const taper = Math.sin(Math.PI * t);
    const w = wiggleAmp * taper * Math.sin(wiggleFreq * Math.PI * t + wigglePhase);
    px += -dy * w;
    py += dx * w;
    pts.push({ x: px, y: py });
  }
  return pts;
}

/** Irregular closed blob — woods, lakes, parks. */
function blob(cx, cy, radius, rand, jitter = 0.35) {
  const n = 16;
  const phase = rand() * Math.PI * 2;
  const harmonics = [
    { k: 2, a: (rand() - 0.5) * jitter, p: rand() * 6.28 },
    { k: 3, a: (rand() - 0.5) * jitter, p: rand() * 6.28 },
    { k: 5, a: (rand() - 0.5) * jitter * 0.6, p: rand() * 6.28 },
  ];
  const ring = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2 + phase;
    let r = radius;
    for (const h of harmonics) r *= 1 + h.a * Math.sin(h.k * t + h.p);
    ring.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  ring[ring.length - 1] = ring[0];
  return ring;
}

/** Union-find, for the minimum spanning tree that guarantees every village is reachable. */
function makeUnionFind(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  return {
    union(a, b) {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return false;
      parent[ra] = rb;
      return true;
    },
  };
}

/**
 * Builds the world: villages on a jittered grid, a road network over them,
 * a river, woods and fields, plus the graph the routes are planned on.
 */
export function buildWorld({
  seed = 20260909,
  center = { lat: 50.7418, lon: -2.6231 },
  extentM = 26000,
} = {}) {
  const rand = mulberry32(seed);
  const frame = makeFrame(center);
  const terrain = makeTerrain(rand);
  const coverNoise = makeCoverNoise(rand);
  const half = extentM / 2;

  // --- Villages -----------------------------------------------------------
  const cols = 4;
  const rows = 4;
  const spacing = extentM / cols;
  const nodes = [];
  const addVillage = (x, y) => {
    nodes.push({
      id: nodes.length,
      x,
      y,
      name: VILLAGE_NAMES[nodes.length % VILLAGE_NAMES.length],
      ele: terrain(x, y),
    });
  };

  // The inner grid, in a fixed order: routes are defined against these indices.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      addVillage(
        -half + spacing * (c + 0.5) + (rand() - 0.5) * spacing * 0.55,
        -half + spacing * (r + 0.5) + (rand() - 0.5) * spacing * 0.55,
      );
    }
  }

  // A ring of further villages, so zooming out to fit a whole route doesn't
  // run off the edge of the generated world into blank background.
  const outerCells = 7;
  const outerSpacing = (extentM * OUTER_SCALE) / outerCells;
  const outerHalf = (extentM * OUTER_SCALE) / 2;
  for (let r = 0; r < outerCells; r++) {
    for (let c = 0; c < outerCells; c++) {
      const x = -outerHalf + outerSpacing * (c + 0.5) + (rand() - 0.5) * outerSpacing * 0.5;
      const y = -outerHalf + outerSpacing * (r + 0.5) + (rand() - 0.5) * outerSpacing * 0.5;
      if (Math.abs(x) < half * 1.1 && Math.abs(y) < half * 1.1) continue;
      addVillage(x, y);
    }
  }
  // The biggest settlement sits nearest the middle — that's where routes start.
  let hubIndex = 0;
  let hubDist = Infinity;
  nodes.slice(0, rows * cols).forEach((n, i) => {
    const d = Math.hypot(n.x, n.y);
    if (d < hubDist) {
      hubDist = d;
      hubIndex = i;
    }
  });
  nodes[hubIndex].placeClass = "town";
  nodes.forEach((n, i) => {
    if (i !== hubIndex) n.placeClass = i % 3 === 0 ? "hamlet" : "village";
  });

  // --- Road network -------------------------------------------------------
  const candidates = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      candidates.push({ i, j, d: dist(nodes[i], nodes[j]) });
    }
  }
  candidates.sort((a, b) => a.d - b.d);

  const uf = makeUnionFind(nodes.length);
  const edges = [];
  const seen = new Set();
  const key = (i, j) => `${Math.min(i, j)}-${Math.max(i, j)}`;
  for (const c of candidates) {
    if (uf.union(c.i, c.j)) {
      edges.push({ a: c.i, b: c.j, length: c.d });
      seen.add(key(c.i, c.j));
    }
  }
  // A few extra links so the network has loops rather than a bare tree.
  for (const c of candidates) {
    if (seen.has(key(c.i, c.j))) continue;
    if (c.d > spacing * 1.35) continue;
    if (rand() > 0.5) continue;
    edges.push({ a: c.i, b: c.j, length: c.d });
    seen.add(key(c.i, c.j));
  }

  const adjacency = nodes.map(() => []);
  edges.forEach((edge, index) => {
    edge.index = index;
    edge.geometry = curveBetween(nodes[edge.a], nodes[edge.b], rand);
    adjacency[edge.a].push({ to: edge.b, edge: index });
    adjacency[edge.b].push({ to: edge.a, edge: index });
  });

  /** Dijkstra over the village graph, used both to classify roads and to plan routes. */
  function shortestPath(from, to) {
    const distTo = nodes.map(() => Infinity);
    const prev = nodes.map(() => null);
    const visited = new Set();
    distTo[from] = 0;
    while (visited.size < nodes.length) {
      let current = -1;
      let best = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        if (!visited.has(i) && distTo[i] < best) {
          best = distTo[i];
          current = i;
        }
      }
      if (current === -1) break;
      if (current === to) break;
      visited.add(current);
      for (const link of adjacency[current]) {
        const alt = distTo[current] + edges[link.edge].length;
        if (alt < distTo[link.to]) {
          distTo[link.to] = alt;
          prev[link.to] = { from: current, edge: link.edge };
        }
      }
    }
    const path = [];
    let cursor = to;
    while (cursor !== from) {
      const step = prev[cursor];
      if (!step) return null;
      path.unshift({ from: step.from, to: cursor, edge: step.edge });
      cursor = step.from;
    }
    return path;
  }

  const extremes = (pick) =>
    nodes.reduce((best, n) => (pick(n) > pick(best) ? n : best), nodes[0]).id;
  const west = extremes((n) => -n.x);
  const east = extremes((n) => n.x);
  const south = extremes((n) => -n.y);
  const north = extremes((n) => n.y);

  for (const edge of edges) edge.roadClass = "minor";
  for (const step of shortestPath(west, east) ?? []) edges[step.edge].roadClass = "primary";
  for (const step of shortestPath(south, north) ?? []) {
    if (edges[step.edge].roadClass === "minor") edges[step.edge].roadClass = "secondary";
  }

  let bNumber = 3157;
  const laneNames = LANE_NAMES;
  edges.forEach((edge, i) => {
    if (edge.roadClass === "primary") edge.name = `B${bNumber}`;
    else if (edge.roadClass === "secondary") edge.name = `B${bNumber + 1 + (i % 3)}`;
    else edge.name = laneNames[i % laneNames.length];
  });

  // --- Feature layers -----------------------------------------------------
  const transportation = [];
  const transportationName = [];
  const building = [];
  const landuse = [];
  const place = [];

  const lineFeature = (pts, properties) => ({
    type: "Feature",
    properties,
    geometry: { type: "LineString", coordinates: pts.map((p) => frame.toLonLat(p.x, p.y)) },
  });
  const polygonFeature = (ring, properties) => ({
    type: "Feature",
    properties,
    geometry: { type: "Polygon", coordinates: [ring.map((p) => frame.toLonLat(p.x, p.y))] },
  });

  for (const edge of edges) {
    transportation.push(lineFeature(edge.geometry, { class: edge.roadClass, name: edge.name }));
    if (edge.roadClass !== "minor") {
      transportationName.push(
        lineFeature(edge.geometry, { class: edge.roadClass, name: edge.name }),
      );
    }
  }

  // Village streets and the houses along them.
  for (const node of nodes) {
    const streetCount = node.placeClass === "town" ? 7 : node.placeClass === "village" ? 4 : 2;
    for (let s = 0; s < streetCount; s++) {
      const angle = rand() * Math.PI * 2;
      const length = 120 + rand() * 260;
      const start = { x: node.x + Math.cos(angle) * 30, y: node.y + Math.sin(angle) * 30 };
      const end = {
        x: node.x + Math.cos(angle) * length,
        y: node.y + Math.sin(angle) * length,
      };
      const street = curveBetween(start, end, rand);
      transportation.push(lineFeature(street, { class: rand() < 0.3 ? "service" : "minor" }));
      const houses = Math.round(length / 70);
      for (let h = 0; h < houses; h++) {
        const t = (h + 0.5) / houses;
        const px = start.x + (end.x - start.x) * t;
        const py = start.y + (end.y - start.y) * t;
        const side = h % 2 === 0 ? 1 : -1;
        const ox = -Math.sin(angle) * 16 * side;
        const oy = Math.cos(angle) * 16 * side;
        const w = 7 + rand() * 5;
        building.push(
          polygonFeature(
            [
              { x: px + ox - w, y: py + oy - w },
              { x: px + ox + w, y: py + oy - w },
              { x: px + ox + w, y: py + oy + w },
              { x: px + ox - w, y: py + oy + w },
              { x: px + ox - w, y: py + oy - w },
            ],
            {},
          ),
        );
      }
    }
    const builtRadius =
      node.placeClass === "town" ? 620 : node.placeClass === "village" ? 340 : 190;
    landuse.push(
      polygonFeature(blob(node.x, node.y, builtRadius, rand, 0.22), { class: "residential" }),
    );
    place.push({
      type: "Feature",
      properties: {
        class: node.placeClass,
        name: node.name,
        rank: node.placeClass === "town" ? 3 : 6,
      },
      geometry: { type: "Point", coordinates: frame.toLonLat(node.x, node.y) },
    });
  }

  // Farm lanes spurring off the through-roads — without these the map reads
  // as empty at the zoom levels navigation uses.
  for (const edge of edges) {
    const spurs = 1 + Math.floor(rand() * 3);
    for (let s = 0; s < spurs; s++) {
      const from = edge.geometry[Math.floor(rand() * (edge.geometry.length - 2)) + 1];
      const angle = rand() * Math.PI * 2;
      const length = 700 + rand() * 2400;
      const to = { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
      const geometry = curveBetween(from, to, rand);
      transportation.push(
        lineFeature(geometry, {
          class: "minor",
          name: laneNames[Math.floor(rand() * laneNames.length)],
        }),
      );
      // Half of them run on to meet another lane rather than dead-ending.
      if (rand() < 0.5) {
        const target = nodes[Math.floor(rand() * nodes.length)];
        transportation.push(lineFeature(curveBetween(to, target, rand), { class: "minor" }));
      }
    }
  }

  // Farm tracks and footpaths hanging off the lanes, plus a signed cycle route.
  for (let i = 0; i < 130; i++) {
    const node =
      rand() < 0.5
        ? nodes[Math.floor(rand() * nodes.length)]
        : {
            x: (rand() - 0.5) * extentM * OUTER_SCALE,
            y: (rand() - 0.5) * extentM * OUTER_SCALE,
          };
    const angle = rand() * Math.PI * 2;
    const length = 500 + rand() * 1800;
    const end = { x: node.x + Math.cos(angle) * length, y: node.y + Math.sin(angle) * length };
    const geometry = curveBetween(node, end, rand);
    const roll = rand();
    if (roll < 0.5) transportation.push(lineFeature(geometry, { class: "track" }));
    else if (roll < 0.85)
      transportation.push(lineFeature(geometry, { class: "path", subclass: "footway" }));
    else
      transportation.push(
        lineFeature(geometry, { class: "path", subclass: "cycleway", name: "National Route 26" }),
      );
  }
  // One longer traffic-free cycleway, the kind of thing a route is planned around.
  const cyclewayPath = shortestPath(west, north);
  if (cyclewayPath) {
    for (const step of cyclewayPath.slice(0, 2)) {
      const geometry = edges[step.edge].geometry.map((p) => ({ x: p.x + 55, y: p.y + 55 }));
      transportation.push(
        lineFeature(geometry, { class: "path", subclass: "cycleway", name: "National Route 26" }),
      );
    }
  }

  // --- Water, woods, fields ----------------------------------------------
  const water = [];
  const waterway = [];
  const landcover = [];
  const park = [];

  const riverStart = { x: -outerHalf * 1.05, y: -half * 0.2 + (rand() - 0.5) * 3000 };
  const riverEnd = { x: outerHalf * 1.05, y: half * 0.35 + (rand() - 0.5) * 3000 };
  const river = curveBetween(riverStart, riverEnd, rand);
  waterway.push(lineFeature(river, { class: "river", name: "River Cranmoor" }));
  for (let i = 0; i < 3; i++) {
    const anchor = river[Math.floor(rand() * river.length)];
    const tributary = curveBetween(
      { x: anchor.x + (rand() - 0.5) * 5000, y: anchor.y + (rand() - 0.5) * 5000 },
      anchor,
      rand,
    );
    waterway.push(lineFeature(tributary, { class: "stream" }));
  }
  for (let i = 0; i < 2; i++) {
    const anchor = river[Math.floor(river.length * (0.25 + rand() * 0.5))];
    water.push(
      polygonFeature(blob(anchor.x + 400, anchor.y + 500, 260 + rand() * 320, rand), {
        class: "lake",
      }),
    );
  }

  const nearVillage = (x, y, minDistance) =>
    nodes.some((n) => Math.hypot(n.x - x, n.y - y) < minDistance);

  // A patchwork of fields and copses covering the whole area. Sparse blobs
  // look fine zoomed out and painfully empty at navigation zoom, where a
  // rider sees a few hundred metres of countryside at a time.
  const field = 380;
  const covered = extentM * OUTER_SCALE;
  const cells = Math.ceil(covered / field) + 2;
  const corner = (cx, cy) => ({
    x: cx * field - covered / 2 + (rand() - 0.5) * field * 0.45,
    y: cy * field - covered / 2 + (rand() - 0.5) * field * 0.45,
  });
  const corners = [];
  for (let cy = 0; cy <= cells; cy++) {
    corners.push([]);
    for (let cx = 0; cx <= cells; cx++) corners[cy].push(corner(cx, cy));
  }
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const ring = [
        corners[cy][cx],
        corners[cy][cx + 1],
        corners[cy + 1][cx + 1],
        corners[cy + 1][cx],
        corners[cy][cx],
      ];
      const midX = (ring[0].x + ring[2].x) / 2;
      const midY = (ring[0].y + ring[2].y) / 2;
      if (nearVillage(midX, midY, 420)) continue;
      // Smooth noise, nudged upward on the tops (where woodland tends to
      // survive the plough) and jittered a little so edges stay ragged.
      const height = terrain(midX, midY);
      const cover = coverNoise(midX, midY) + (height > 200 ? 0.18 : 0) + (rand() - 0.5) * 0.16;
      if (cover > 0.3) landcover.push(polygonFeature(ring, { class: "wood" }));
      else if (cover > -0.24) landcover.push(polygonFeature(ring, { class: "grass" }));
    }
  }
  // A few larger woods that read as woodland rather than a single field.
  for (let i = 0; i < 40; i++) {
    const x = (rand() - 0.5) * extentM * OUTER_SCALE;
    const y = (rand() - 0.5) * extentM * OUTER_SCALE;
    if (nearVillage(x, y, 800)) continue;
    landcover.push(polygonFeature(blob(x, y, 350 + rand() * 650, rand), { class: "wood" }));
  }
  for (let i = 0; i < 3; i++) {
    const node = nodes[Math.floor(rand() * nodes.length)];
    park.push(
      polygonFeature(blob(node.x + 500, node.y - 400, 300 + rand() * 400, rand), { class: "park" }),
    );
  }

  const collection = (features) => ({ type: "FeatureCollection", features });

  return {
    seed,
    center,
    frame,
    terrain,
    nodes,
    edges,
    adjacency,
    shortestPath,
    layers: {
      landcover: collection(landcover),
      landuse: collection(landuse),
      park: collection(park),
      water: collection(water),
      waterway: collection(waterway),
      transportation: collection(transportation),
      transportation_name: collection(transportationName),
      building: collection(building),
      place: collection(place),
      boundary: collection([]),
    },
    rand,
  };
}
