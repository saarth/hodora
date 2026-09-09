/**
 * Network stand-ins for the screenshot run.
 *
 * The app talks to Supabase, Open-Meteo, Overpass, Nominatim and a bike
 * router. A screenshot run answers all of them locally so the shots are
 * deterministic (same weather, same POIs, same routes every time) and so it
 * works on a machine that can't reach any of them.
 *
 * Everything here is wired through Playwright request interception — the app
 * itself is untouched and makes exactly the calls it normally would.
 */

/** Nearest junction to a point, when there is one close enough to snap to. */
function snapToJunction(world, target, withinM = 900) {
  let best = null;
  for (const node of world.nodes) {
    const [lon, lat] = world.frame.toLonLat(node.x, node.y);
    const d = Math.hypot((lat - target.lat) * 111320, (lon - target.lon) * 70000);
    if (!best || d < best.d) best = { d, node, lat, lon };
  }
  return best && best.d <= withinM ? best : null;
}

/** Nearest point on the generated road network, with the lane it belongs to. */
function snapToNetwork(world, target) {
  let best = null;
  world.edges.forEach((edge, edgeIndex) => {
    edge.geometry.forEach((point, vertexIndex) => {
      const [lon, lat] = world.frame.toLonLat(point.x, point.y);
      const d = (lat - target.lat) ** 2 + (lon - target.lon) ** 2;
      if (!best || d < best.d) best = { d, edgeIndex, vertexIndex, lat, lon };
    });
  });
  return best;
}

const lonLat = (world, point) => {
  const [lon, lat] = world.frame.toLonLat(point.x, point.y);
  return [lon, lat];
};

/**
 * Routes between two points over the generated road graph — what the public
 * bike routers do for real, at the scale of this demo world.
 *
 * Points that sit on or near a junction are snapped to it and routed junction
 * to junction; anything else joins the network at the nearest lane vertex and
 * rides to the end of that lane first, which is close enough to how a router
 * treats a point dropped in the middle of a field.
 */
function routeOverNetwork(world, from, to) {
  const coordinates = [];
  const push = (coordinate) => {
    const last = coordinates[coordinates.length - 1];
    if (!last || last[0] !== coordinate[0] || last[1] !== coordinate[1])
      coordinates.push(coordinate);
  };
  const pushEdge = (edgeIndex, fromNode) => {
    const edge = world.edges[edgeIndex];
    const geometry = edge.a === fromNode ? edge.geometry : [...edge.geometry].reverse();
    for (const point of geometry) push(lonLat(world, point));
  };

  const startJunction = snapToJunction(world, from);
  const endJunction = snapToJunction(world, to);

  if (startJunction && endJunction) {
    push([from.lon, from.lat]);
    push([startJunction.lon, startJunction.lat]);
    for (const step of world.shortestPath(startJunction.node.id, endJunction.node.id) ?? []) {
      pushEdge(step.edge, step.from);
    }
    push([to.lon, to.lat]);
    return coordinates;
  }

  const start = snapToNetwork(world, from);
  const end = snapToNetwork(world, to);
  if (!start || !end) return [];

  const startEdge = world.edges[start.edgeIndex];
  const endEdge = world.edges[end.edgeIndex];
  const between = (node, point) => Math.hypot(node.x - point.x, node.y - point.y);
  const nearerEnd = (edge, vertexIndex, towards) => {
    const vertex = edge.geometry[vertexIndex];
    const viaA = between(world.nodes[edge.a], vertex) + between(world.nodes[edge.a], towards);
    const viaB = between(world.nodes[edge.b], vertex) + between(world.nodes[edge.b], towards);
    return viaA <= viaB ? edge.a : edge.b;
  };
  const exitNode = nearerEnd(startEdge, start.vertexIndex, endEdge.geometry[end.vertexIndex]);
  const entryNode =
    start.edgeIndex === end.edgeIndex
      ? exitNode
      : nearerEnd(endEdge, end.vertexIndex, startEdge.geometry[start.vertexIndex]);

  push([from.lon, from.lat]);
  const head =
    exitNode === startEdge.b
      ? startEdge.geometry.slice(start.vertexIndex)
      : startEdge.geometry.slice(0, start.vertexIndex + 1).reverse();
  for (const point of head) push(lonLat(world, point));
  for (const step of world.shortestPath(exitNode, entryNode) ?? []) pushEdge(step.edge, step.from);
  const tail =
    entryNode === endEdge.a
      ? endEdge.geometry.slice(0, end.vertexIndex + 1)
      : endEdge.geometry.slice(end.vertexIndex).reverse();
  for (const point of tail) push(lonLat(world, point));
  push([to.lon, to.lat]);

  return coordinates;
}

function pathLengthM(coordinates) {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    const dLat = (lat2 - lat1) * 111320;
    const dLon = (lon2 - lon1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
    total += Math.hypot(dLat, dLon);
  }
  return total;
}

/** Deterministic-ish hourly forecast: a mild, breezy day with rain moving in later. */
function buildForecast({ rainInMinutes = 150, days = 8 } = {}) {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const pad = (n) => String(n).padStart(2, "0");
  const time = [];
  const temperature = [];
  const windSpeed = [];
  const windDirection = [];
  const weatherCode = [];
  const precipitation = [];
  const precipitationProbability = [];

  const rainAt = new Date(now.getTime() + rainInMinutes * 60_000);

  for (let h = 0; h < days * 24; h++) {
    const at = new Date(midnight.getTime() + h * 3_600_000);
    time.push(
      `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:00`,
    );
    const hour = at.getHours();
    const dayIndex = Math.floor(h / 24);
    const diurnal = Math.sin(((hour - 4) / 24) * Math.PI * 2);
    temperature.push(Number((14.5 + diurnal * 4.5 - dayIndex * 0.35).toFixed(1)));
    windSpeed.push(Number((4.2 + Math.sin(h / 7) * 2.4 + dayIndex * 0.2).toFixed(1)));
    windDirection.push(
      Math.round((((232 + Math.sin(h / 11) * 38 + dayIndex * 9) % 360) + 360) % 360),
    );

    const hoursToRain = (at.getTime() - rainAt.getTime()) / 3_600_000;
    const raining = hoursToRain >= -0.5 && hoursToRain <= 2.5;
    weatherCode.push(raining ? 61 : hour < 7 || hour > 19 ? 2 : dayIndex % 3 === 1 ? 3 : 1);
    precipitation.push(raining ? Number((0.4 + Math.random() * 0).toFixed(1)) : 0);
    precipitationProbability.push(raining ? 78 : Math.max(4, Math.round(22 - diurnal * 12)));
  }

  return {
    time,
    temperature_2m: temperature,
    wind_speed_10m: windSpeed,
    wind_direction_10m: windDirection,
    weather_code: weatherCode,
    precipitation,
    precipitation_probability: precipitationProbability,
  };
}

const CAFE_NAMES = [
  "The Pedal & Pot",
  "Bramley Tea Rooms",
  "Old Forge Café",
  "Wheelhouse Coffee",
  "The Bothy",
];
const SHOP_NAMES = ["Ashcombe Cycles", "Vale Bike Works", "Cranmoor Cycle Repair"];

/** POIs scattered along a route, the way Overpass returns them for a bbox query. */
function buildPois(world) {
  const elements = [];
  let id = 1000;
  world.nodes.forEach((node, index) => {
    const [lon, lat] = world.frame.toLonLat(node.x + 60, node.y - 40);
    const category = index % 4;
    const tags =
      category === 0
        ? { amenity: "cafe", name: CAFE_NAMES[index % CAFE_NAMES.length] }
        : category === 1
          ? { amenity: "drinking_water" }
          : category === 2
            ? { shop: "bicycle", name: SHOP_NAMES[index % SHOP_NAMES.length] }
            : { amenity: "toilets" };
    elements.push({ type: "node", id: id++, lat, lon, tags });
    if (category === 0) {
      const [lon2, lat2] = world.frame.toLonLat(node.x - 380, node.y + 260);
      elements.push({
        type: "node",
        id: id++,
        lat: lat2,
        lon: lon2,
        tags: { amenity: "drinking_water" },
      });
    }
  });
  return { version: 0.6, elements };
}

const jsonRoute = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });

/**
 * Installs every stub on a Playwright browser context.
 *
 * `basemap` is optional: pass one to serve the generated stand-in tiles,
 * leave it out to let real tile requests through to the network.
 */
export async function installStubs(
  context,
  { world, rides, profile, supabaseUrl, basemap, fontCss, weather },
) {
  const forecast = buildForecast(weather);
  const pois = buildPois(world);
  const summaryOf = ({ points, notes, cues, plan_waypoints, plan_profile, ...summary }) => summary;

  // --- Supabase -----------------------------------------------------------
  const host = new URL(supabaseUrl).host;
  await context.route(`**://${host}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.startsWith("/auth/v1/")) {
      if (path.endsWith("/user")) {
        return jsonRoute(route, authUser(profile));
      }
      if (path.endsWith("/token")) {
        return jsonRoute(route, session(profile));
      }
      if (path.endsWith("/logout")) return route.fulfill({ status: 204, body: "" });
      return jsonRoute(route, {});
    }

    if (path === "/rest/v1/rides") {
      if (route.request().method() !== "GET") return jsonRoute(route, []);
      const idFilter = url.searchParams.get("id");
      if (idFilter?.startsWith("eq.")) {
        const ride = rides.find((r) => r.id === idFilter.slice(3));
        const single = route.request().headers()["accept"]?.includes("vnd.pgrst.object");
        if (!ride) return jsonRoute(route, single ? null : []);
        return jsonRoute(route, single ? ride : [ride]);
      }
      return jsonRoute(route, rides.map(summaryOf));
    }

    if (path === "/rest/v1/profiles") {
      const single = route.request().headers()["accept"]?.includes("vnd.pgrst.object");
      return jsonRoute(route, single ? profile : [profile]);
    }

    return jsonRoute(route, []);
  });

  // --- Weather ------------------------------------------------------------
  await context.route("**://api.open-meteo.com/**", async (route) => {
    const url = new URL(route.request().url());
    const body = {
      latitude: Number(url.searchParams.get("latitude")),
      longitude: Number(url.searchParams.get("longitude")),
      timezone: "Europe/London",
    };
    if (url.searchParams.has("current")) {
      body.current = {
        time: new Date().toISOString().slice(0, 16),
        temperature_2m: 16.8,
        apparent_temperature: 15.2,
        precipitation: 0,
        weather_code: 3,
        wind_speed_10m: 5.4,
        wind_gusts_10m: 9.1,
        wind_direction_10m: 238,
        is_day: 1,
      };
    }
    if (url.searchParams.has("hourly")) body.hourly = forecast;
    return jsonRoute(route, body);
  });

  // --- Points of interest -------------------------------------------------
  await context.route("**/api/interpreter*", (route) => jsonRoute(route, pois));

  // --- Place search -------------------------------------------------------
  await context.route("**://nominatim.openstreetmap.org/**", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q")?.toLowerCase() ?? "";
    const matches = world.nodes
      .filter((node) => !query || node.name.toLowerCase().includes(query))
      .slice(0, 6)
      .map((node, i) => {
        const [lon, lat] = world.frame.toLonLat(node.x, node.y);
        return {
          place_id: 100 + i,
          lat: String(lat),
          lon: String(lon),
          display_name: `${node.name}, Ashcombe Vale, England`,
          type: node.placeClass,
        };
      });
    return jsonRoute(route, matches);
  });

  // --- Bike routing -------------------------------------------------------
  const routeHandler = (route) => {
    try {
      return routeResponse(route);
    } catch (error) {
      if (process.env.DEBUG_STUBS) console.log(`      router stub failed: ${error.stack}`);
      return jsonRoute(route, { code: "NoRoute" }, 500);
    }
  };

  const routeResponse = (route) => {
    const url = new URL(route.request().url());
    const isOsrm = url.pathname.includes("/route/v1/");
    const waypoints = isOsrm
      ? url.pathname
          .split("/")
          .pop()
          .split(";")
          .map((pair) => {
            const [lon, lat] = pair.split(",").map(Number);
            return { lat, lon };
          })
      : (url.searchParams.get("lonlats") ?? "").split("|").map((pair) => {
          const [lon, lat] = pair.split(",").map(Number);
          return { lat, lon };
        });

    const coordinates = [];
    for (let i = 1; i < waypoints.length; i++) {
      const leg = routeOverNetwork(world, waypoints[i - 1], waypoints[i]);
      for (const c of leg) {
        const last = coordinates[coordinates.length - 1];
        if (!last || last[0] !== c[0] || last[1] !== c[1]) coordinates.push(c);
      }
    }
    if (coordinates.length < 2) return jsonRoute(route, { code: "NoRoute" }, 400);
    const distance = pathLengthM(coordinates);

    if (isOsrm) {
      return jsonRoute(route, {
        code: "Ok",
        routes: [
          {
            distance,
            duration: distance / 5.4,
            geometry: { type: "LineString", coordinates },
            legs: [{ steps: osrmSteps(world, coordinates) }],
          },
        ],
      });
    }
    return jsonRoute(route, {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { "track-length": String(Math.round(distance)) },
          geometry: { type: "LineString", coordinates },
        },
      ],
    });
  };
  await context.route("**://routing.openstreetmap.de/**", routeHandler);
  await context.route("**://brouter.de/**", routeHandler);

  // --- Web fonts ----------------------------------------------------------
  if (fontCss) {
    await context.route("**://fonts.googleapis.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/css",
        headers: { "access-control-allow-origin": "*" },
        body: fontCss,
      }),
    );
  }

  // --- Basemap ------------------------------------------------------------
  if (basemap) await installBasemap(context, basemap);
}

/** Turn-by-turn steps for the stubbed OSRM response, one per lane the route uses. */
function osrmSteps(world, coordinates) {
  const steps = [];
  const stride = Math.max(12, Math.floor(coordinates.length / 9));
  for (let i = 0; i < coordinates.length; i += stride) {
    const slice = coordinates.slice(i, i + stride + 1);
    if (slice.length < 2) break;
    const maneuver =
      i === 0 ? { type: "depart" } : { type: "turn", modifier: turnModifier(coordinates, i) };
    steps.push({
      distance: pathLengthM(slice),
      name: world.edges[(i / stride) % world.edges.length]?.name ?? "",
      maneuver,
    });
  }
  steps.push({ distance: 0, name: "", maneuver: { type: "arrive" } });
  return steps;
}

function turnModifier(coordinates, i) {
  const before = coordinates[Math.max(0, i - 4)];
  const at = coordinates[i];
  const after = coordinates[Math.min(coordinates.length - 1, i + 4)];
  const angle = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  let delta = ((angle(at, after) - angle(before, at)) * 180) / Math.PI;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  if (Math.abs(delta) < 15) return "straight";
  if (Math.abs(delta) < 50) return delta > 0 ? "slight left" : "slight right";
  return delta > 0 ? "left" : "right";
}

/** Serves generated vector tiles and glyphs in place of the real tile host. */
async function installBasemap(
  context,
  { tileSource, glyphSource, tileHost = "tiles.openfreemap.org" },
) {
  const tileTemplate = `https://${tileHost}/planet/screenshot/{z}/{x}/{y}.pbf`;

  await context.route(`**://${tileHost}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (process.env.DEBUG_TILES) console.log(`      tile request ${url.pathname}`);
    const headers = { "access-control-allow-origin": "*", "cache-control": "no-store" };

    const fonts = url.pathname.match(/^\/fonts\/(.+)\/(\d+-\d+)\.pbf$/);
    if (fonts) {
      const body = glyphSource?.get(decodeURIComponent(fonts[1]), fonts[2]) ?? Buffer.alloc(0);
      return route.fulfill({ status: 200, headers, contentType: "application/x-protobuf", body });
    }

    const tile = url.pathname.match(/\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
    if (tile) {
      const body = tileSource.tile(Number(tile[1]), Number(tile[2]), Number(tile[3]));
      return route.fulfill({ status: 200, headers, contentType: "application/x-protobuf", body });
    }

    if (url.pathname === "/planet" || url.pathname === "/planet/") {
      return route.fulfill({
        status: 200,
        headers,
        contentType: "application/json",
        body: JSON.stringify(tileSource.tilejson(tileTemplate)),
      });
    }

    return route.fulfill({ status: 404, headers, body: "" });
  });
}

function authUser(profile) {
  return {
    id: profile.id,
    aud: "authenticated",
    role: "authenticated",
    email: "sam@example.com",
    email_confirmed_at: "2026-02-11T09:14:00Z",
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { display_name: profile.display_name },
    identities: [],
    created_at: "2026-02-11T09:14:00Z",
    updated_at: "2026-09-08T18:22:00Z",
  };
}

function session(profile) {
  return {
    access_token: "screenshot-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "screenshot-refresh-token",
    user: authUser(profile),
  };
}

export { authUser, session };
