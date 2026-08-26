import type { RidePoint } from "./gpx";

/**
 * Projects a route's lat/lon points into a normalized SVG path string that
 * fits a `width`x`height` viewBox, preserving the route's shape (not just
 * its bounding box) for a small route-card preview.
 */
export function routeThumbnailPath(
  points: RidePoint[],
  {
    width = 96,
    height = 64,
    padding = 6,
  }: { width?: number; height?: number; padding?: number } = {},
): string | null {
  if (points.length < 2) return null;

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

  const latRange = Math.max(maxLat - minLat, 1e-6);
  // Longitude degrees compress horizontally away from the equator; scale by
  // cos(latitude) so the thumbnail isn't stretched for routes far from it.
  const cosLat = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)) || 1;
  const lonRange = Math.max((maxLon - minLon) * cosLat, 1e-6);

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const scale = Math.min(innerW / lonRange, innerH / latRange);

  const offsetX = padding + (innerW - lonRange * scale) / 2;
  const offsetY = padding + (innerH - latRange * scale) / 2;

  const toXY = (p: RidePoint) => {
    const x = offsetX + (p.lon - minLon) * cosLat * scale;
    // SVG y grows downward; latitude grows northward, so flip.
    const y = offsetY + (maxLat - p.lat) * scale;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };

  return `M${points.map(toXY).join(" L")}`;
}
