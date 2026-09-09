/**
 * Demo rides for the screenshot run.
 *
 * Routes are planned over the same road graph the stand-in basemap is drawn
 * from (see `world.mjs`), so the line on the map follows the lanes under it
 * and every cue lands on a junction that is actually there. Ride records
 * match the shape `src/lib/rides.ts` reads, so the app renders them through
 * its normal code path — nothing in the UI knows these are generated.
 */

const R = 6371000;

function haversine(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearing(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Signed turn angle in degrees, negative left, positive right. */
function turnAngle(from, to) {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function directionFor(delta) {
  const abs = Math.abs(delta);
  if (abs < 18) return "straight";
  if (abs < 45) return delta < 0 ? "slight-left" : "slight-right";
  if (abs < 110) return delta < 0 ? "left" : "right";
  if (abs < 160) return delta < 0 ? "sharp-left" : "sharp-right";
  return "uturn";
}

/** Orders villages into a loop by angle around their own centroid. */
function loopOrder(world, ids) {
  const pts = ids.map((id) => world.nodes[id]);
  const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
  const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
  return [...ids].sort(
    (a, b) =>
      Math.atan2(world.nodes[a].y - cy, world.nodes[a].x - cx) -
      Math.atan2(world.nodes[b].y - cy, world.nodes[b].x - cx),
  );
}

/**
 * Walks the road graph through `villageIds` and back to the start, returning
 * the raw polyline plus the junctions passed through (which become cues).
 */
function walkLoop(world, villageIds) {
  const order = loopOrder(world, villageIds);
  const sequence = [...order, order[0]];
  const coords = [];
  const junctions = [];

  // Flatten the whole loop into one list of lanes first, dropping any lane
  // the route immediately doubles back along. Those out-and-backs are what
  // turn into "make a U-turn" in the cue sheet, and a loop shouldn't have any.
  const walked = [];
  for (let i = 0; i < sequence.length - 1; i++) {
    for (const step of world.shortestPath(sequence[i], sequence[i + 1]) ?? []) walked.push(step);
  }
  const trimmed = [];
  for (const step of walked) {
    if (trimmed.length && trimmed[trimmed.length - 1].edge === step.edge) trimmed.pop();
    else trimmed.push(step);
  }
  // A village set that hangs off dead ends can cancel down to nothing; keep
  // the honest out-and-back rather than returning an empty route.
  const steps = trimmed.length >= 3 ? trimmed : walked;

  for (const step of steps) {
    const edge = world.edges[step.edge];
    const geometry = edge.a === step.from ? edge.geometry : [...edge.geometry].reverse();
    const lonLats = geometry.map((p) => world.frame.toLonLat(p.x, p.y));
    if (coords.length) {
      junctions.push({ at: coords[coords.length - 1], name: edge.name, node: step.from });
      lonLats.shift();
    }
    for (const [lon, lat] of lonLats) coords.push({ lat, lon });
  }
  return { coords, junctions };
}

/** Resamples to an even spacing so distance-based UI (grade, cues, progress) behaves. */
function resample(coords, spacing = 22) {
  const out = [coords[0]];
  let carry = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const segment = haversine(a, b);
    if (segment < 1e-6) continue;
    let travelled = spacing - carry;
    while (travelled <= segment) {
      const t = travelled / segment;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
      travelled += spacing;
    }
    carry = (carry + segment) % spacing;
  }
  out.push(coords[coords.length - 1]);
  return out;
}

/** Rolling mean over the elevation samples — raw terrain reads too spiky on the chart. */
function smooth(values, window) {
  return values.map((_, i) => {
    const from = Math.max(0, i - window);
    const to = Math.min(values.length - 1, i + window);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += values[j];
    return sum / (to - from + 1);
  });
}

const DIFFICULTY_FOR = (distanceKm, ascentM) => {
  const score = distanceKm + ascentM / 25;
  if (score < 40) return "easy";
  if (score < 80) return "moderate";
  if (score < 130) return "hard";
  return "extreme";
};

/**
 * Builds one ride record: points with elevation and cumulative distance,
 * a cue sheet from the junctions, and the summary fields the list shows.
 */
export function planRide(world, spec) {
  const { coords, junctions } = walkLoop(world, spec.villages);
  const spacing = spec.spacingM ?? 22;
  let sampled = resample(coords, spacing);
  let junctionPoints = junctions.map((junction) => ({
    index: nearestPointIndex(sampled, junction.at),
    name: junction.name,
  }));

  // A loop can start anywhere on itself. Starting a short way before a
  // junction means that after a minute of riding, the navigation screen shows
  // a turn coming up *and* an elapsed time and average speed that agree with
  // each other — which they can't if the rider is dropped in mid-route.
  if (spec.startBeforeJunction) {
    const { junction = 1, metresBefore = 520 } = spec.startBeforeJunction;
    const target = junctionPoints[junction % junctionPoints.length];
    if (target) {
      const offset =
        (target.index - Math.round(metresBefore / spacing) + sampled.length) % sampled.length;
      sampled = [...sampled.slice(offset), ...sampled.slice(0, offset)];
      junctionPoints = junctionPoints
        .map((point) => ({
          ...point,
          index: (point.index - offset + sampled.length) % sampled.length,
        }))
        .sort((a, b) => a.index - b.index);
    }
  }

  const raw = sampled.map((p) => {
    const [x, y] = world.frame.toXY(p.lon, p.lat);
    return world.terrain(x, y);
  });
  const elevations = smooth(raw, 6);

  const points = [];
  let cumulative = 0;
  let ascent = 0;
  let descent = 0;
  for (let i = 0; i < sampled.length; i++) {
    if (i > 0) {
      cumulative += haversine(sampled[i - 1], sampled[i]);
      const delta = elevations[i] - elevations[i - 1];
      if (delta > 0) ascent += delta;
      else descent -= delta;
    }
    const point = {
      lat: Number(sampled[i].lat.toFixed(6)),
      lon: Number(sampled[i].lon.toFixed(6)),
      ele: Math.round(elevations[i] * 10) / 10,
      d: Math.round(cumulative),
    };
    points.push(point);
  }

  // A recorded ride carries elapsed time; speed falls off as the road tilts up.
  if (spec.recorded) {
    let elapsed = 0;
    for (let i = 0; i < points.length; i++) {
      if (i > 0) {
        const runM = points[i].d - points[i - 1].d;
        const rise = points[i].ele - points[i - 1].ele;
        const gradient = runM > 0 ? rise / runM : 0;
        const speedKmh = Math.min(46, Math.max(7, 26 - gradient * 340));
        elapsed += runM / (speedKmh / 3.6);
      }
      points[i].t = Math.round(elapsed);
    }
  }

  // Cues: one per junction the route turns at, plus depart and arrive.
  const cues = [{ atM: 0, direction: "depart", name: junctionPoints[0]?.name ?? null }];
  const SPAN = 5;
  for (const junction of junctionPoints) {
    const at = junction.index;
    if (at <= SPAN || at >= points.length - SPAN - 1) continue;
    const incoming = bearing(points[at - SPAN], points[at]);
    const outgoing = bearing(points[at], points[at + SPAN]);
    const direction = directionFor(turnAngle(incoming, outgoing));
    if (direction === "straight") continue;
    const atM = points[at].d;
    if (cues.length && atM - cues[cues.length - 1].atM < 120) continue;
    cues.push({ atM, direction, name: junction.name ?? null });
  }
  cues.push({ atM: points[points.length - 1].d, direction: "arrive", name: null });

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const distanceM = points[points.length - 1].d;

  return {
    id: spec.id,
    user_id: spec.userId,
    name: spec.name,
    description: spec.description ?? null,
    source_filename: spec.sourceFilename ?? null,
    distance_m: distanceM,
    ascent_m: Math.round(ascent),
    descent_m: Math.round(descent),
    min_lat: Math.min(...lats),
    min_lon: Math.min(...lons),
    max_lat: Math.max(...lats),
    max_lon: Math.max(...lons),
    points,
    difficulty: spec.difficulty ?? DIFFICULTY_FOR(distanceM / 1000, ascent),
    surface: spec.surface ?? "paved",
    notes: spec.notes ?? [],
    cues,
    plan_waypoints: spec.planned
      ? loopOrder(world, spec.villages).map((id) => {
          const [lon, lat] = world.frame.toLonLat(world.nodes[id].x, world.nodes[id].y);
          return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
        })
      : null,
    plan_profile: spec.planned ? "trekking" : null,
    is_recorded: Boolean(spec.recorded),
    created_at: spec.createdAt,
    updated_at: spec.createdAt,
  };
}

function nearestPointIndex(points, target) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = (points[i].lat - target.lat) ** 2 + (points[i].lon - target.lon) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

const DEMO_USER_ID = "8b1f4d2e-0c6a-4a91-9b7d-3f5e2c1a7d40";

/** The set of rides the screenshots are taken against. */
export function buildDemoRides(world) {
  const specs = [
    {
      id: "3f2a1c90-5d1e-4b8a-9c33-8a7e6f4b2d11",
      name: "Ashcombe Vale loop",
      startBeforeJunction: { junction: 2, metresBefore: 980 },
      description: "Sunday club run — café stop at Bramley Cross, back over the ridge.",
      villages: [0, 9, 2, 10, 5],
      surface: "paved",
      difficulty: "moderate",
      createdAt: "2026-09-06T07:12:00.000Z",
    },
    {
      id: "6c4b8e12-9a77-4f30-8d21-1e9c5b3a7f22",
      name: "Cranmoor gravel figure-8",
      startBeforeJunction: { junction: 3, metresBefore: 980 },
      description: "Byways and farm tracks — 32mm tyres minimum.",
      villages: [1, 2, 7, 5, 10, 15],
      surface: "gravel",
      difficulty: "hard",
      createdAt: "2026-08-30T06:40:00.000Z",
    },
    {
      id: "a91d7c34-2b5f-4e08-b6c9-4d8a1f7e3b55",
      name: "Beacon Hill hill-repeats",
      startBeforeJunction: { junction: 1, metresBefore: 980 },
      description: "Three ascents of the beacon road, 12% at the top of each.",
      villages: [11, 3, 4, 1],
      surface: "paved",
      difficulty: "hard",
      createdAt: "2026-08-24T16:05:00.000Z",
    },
    {
      id: "d5e8f210-7c3b-4a16-95ef-2b7c6d1a8e33",
      name: "Wednesday chaingang",
      description: null,
      villages: [8, 0, 4],
      surface: "paved",
      difficulty: "moderate",
      recorded: true,
      createdAt: "2026-09-02T17:30:00.000Z",
    },
    {
      id: "b2c9a7e5-4d18-4c72-83af-6e1d9b4c2a77",
      name: "Sportive — Withy Bourne 100",
      description: "Event GPX from the organiser. Feed stations at 38km and 71km.",
      villages: [13, 6, 15, 2, 5, 9, 14],
      sourceFilename: "withy-bourne-100.gpx",
      surface: "mixed",
      difficulty: "extreme",
      createdAt: "2026-08-17T05:55:00.000Z",
    },
    {
      id: "c4a6e903-1b72-4d5f-8e10-9d3b7a2f6c41",
      name: "Café loop via Bramley Cross",
      description: "Planned in Hodora — tweak the waypoints and it re-routes.",
      villages: [6, 2, 14],
      surface: "paved",
      difficulty: "moderate",
      planned: true,
      createdAt: "2026-09-04T09:20:00.000Z",
    },
    {
      id: "e7f1b806-3a25-49d1-b0c4-7f2e8d5a1c99",
      name: "Evening spin to Thornby",
      startBeforeJunction: { junction: 1, metresBefore: 980 },
      description: null,
      villages: [10, 7, 2, 3],
      surface: "paved",
      difficulty: "easy",
      recorded: true,
      createdAt: "2026-09-08T18:02:00.000Z",
    },
  ];

  return specs.map((spec) => planRide(world, { ...spec, userId: DEMO_USER_ID }));
}

export const demoProfile = {
  id: DEMO_USER_ID,
  username: "sam.rider",
  display_name: "Sam Rider",
  avatar_url: null,
  unit: "metric",
  deactivated_at: null,
};

export { DEMO_USER_ID };
