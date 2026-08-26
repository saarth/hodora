/**
 * Place search via OpenStreetMap's Nominatim — free, no key, same "no keys"
 * spirit as the routers and weather API. Nominatim's usage policy caps
 * public requests at ~1/second and wants an identifying referer, which
 * browsers send automatically; callers should debounce keystrokes rather
 * than searching on every one (see PlaceSearch.tsx).
 */

export type GeocodeResult = {
  /** human-readable place name, as returned by Nominatim */
  label: string;
  lat: number;
  lon: number;
};

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";

export async function searchPlaces(
  query: string,
  signal: AbortSignal,
  limit = 6,
): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const url = `${NOMINATIM_ENDPOINT}?format=jsonv2&q=${encodeURIComponent(trimmed)}&limit=${limit}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) return [];
  return data
    .map((item): GeocodeResult => ({
      label: typeof item?.display_name === "string" ? item.display_name : trimmed,
      lat: Number(item?.lat),
      lon: Number(item?.lon),
    }))
    .filter((result) => Number.isFinite(result.lat) && Number.isFinite(result.lon));
}
