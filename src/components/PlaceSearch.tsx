import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchPlaces, type GeocodeResult } from "@/lib/geocode";
import { cn } from "@/lib/utils";

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 400;

/** Debounced place-name search box (Nominatim) that reports the picked result — flying the map there is the caller's job. */
export function PlaceSearch({
  onSelect,
  placeholder = "Search for a place…",
  className,
}: {
  onSelect: (result: GeocodeResult) => void;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      // Clears stale results once the query is too short to search — not a
      // value derived from props/state, so there's no callback to move
      // this into.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      searchPlaces(trimmed, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return;
          setResults(found);
          setOpen(true);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="pl-9 pr-9"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              setOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {results.map((result, index) => (
            <li key={`${result.lat},${result.lon},${index}`}>
              <button
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onSelect(result);
                  setQuery(result.label);
                  setOpen(false);
                }}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{result.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
