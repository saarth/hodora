// Server-side counterpart to `src/lib/gpx.ts`'s `parseGpx`. `parseGpx` uses
// the browser's `DOMParser`, which doesn't exist in the Cloudflare Workers
// or Node runtimes this app's server code actually runs in — so a file
// downloaded from a cloud connection can't be parsed with it directly. This
// extracts the same raw point/name shape a different way (via
// `fast-xml-parser`, already a dependency for the WebDAV client's multistatus
// parsing) and feeds it into the same shared numeric pipeline
// (`buildParsedRide`) that `parseGpx` uses, so simplification/distance/
// ascent/descent math never has two diverging implementations.
import { XMLParser } from "fast-xml-parser";
import { buildParsedRide, type ParsedRide, type RawTrackPoint } from "@/lib/gpx";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true,
});

/** Recursively collects every node under `tag`, anywhere in the tree — mirrors DOM's `getElementsByTagName`. */
function collectByTag(node: unknown, tag: string, found: unknown[] = []): unknown[] {
  if (node === null || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const item of node) collectByTag(item, tag, found);
    return found;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === tag) {
      if (Array.isArray(value)) found.push(...value);
      else found.push(value);
    }
    collectByTag(value, tag, found);
  }
  return found;
}

function asList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

export function parseGpxServer(xml: string, fallbackName: string): ParsedRide {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;

  const trksegs = collectByTag(parsed, "trkseg") as Record<string, unknown>[];
  let nodesWithSeg: { node: Record<string, unknown>; segIndex: number }[];
  if (trksegs.length > 0) {
    nodesWithSeg = trksegs.flatMap((seg, segIndex) =>
      asList(seg.trkpt).map((node) => ({ node, segIndex })),
    );
  } else {
    const trkpts = collectByTag(parsed, "trkpt") as Record<string, unknown>[];
    const flat =
      trkpts.length > 0 ? trkpts : (collectByTag(parsed, "rtept") as Record<string, unknown>[]);
    nodesWithSeg = flat.map((node) => ({ node, segIndex: 0 }));
  }

  if (nodesWithSeg.length < 2) {
    throw new Error("No track points found in this GPX file.");
  }

  const raw: RawTrackPoint[] = [];
  let prevSeg = -1;
  for (const { node, segIndex } of nodesWithSeg) {
    const lat = Number(node["@_lat"]);
    const lon = Number(node["@_lon"]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ele = Number(node.ele);
    raw.push({
      lat,
      lon,
      ele: Number.isFinite(ele) ? ele : 0,
      gap: raw.length > 0 && segIndex !== prevSeg,
    });
    prevSeg = segIndex;
  }

  const names = collectByTag(parsed, "name");
  const nameText =
    typeof names[0] === "string" || typeof names[0] === "number" ? String(names[0]).trim() : "";

  return buildParsedRide(raw, nameText || fallbackName);
}
