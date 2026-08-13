/**
 * Offline store for rides and profile, backed by IndexedDB.
 * Everything needed to navigate a saved route lives here, so navigation keeps
 * working with no network connection at all.
 */
import type { Ride, RideSummary, Profile } from "./rides";
import type { RideSession } from "./sessions";
import { TILE_CACHE } from "./offline-tiles";

const DB_NAME = "hodora-offline";
const DB_VERSION = 2;
const RIDES = "rides";
const META = "meta";
const SESSIONS = "sessions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RIDES)) db.createObjectStore(RIDES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(SESSIONS))
        db.createObjectStore(SESSIONS, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

/**
 * Full ride records, saved for offline navigation. Deliberately *not*
 * wrapped in `safe()` — callers (e.g. `OfflineSaveCard`) tell the rider
 * their route is "saved for offline use" once this resolves, so a write
 * failure (quota exceeded, private browsing, storage eviction) must
 * propagate instead of being silently swallowed into a false success.
 */
export async function putOfflineRide(ride: Ride): Promise<void> {
  await tx(RIDES, "readwrite", (store) => store.put({ ...ride, savedAt: Date.now() }));
}

export async function getOfflineRide(id: string): Promise<Ride | null> {
  const record = await safe(
    tx<Ride | undefined>(RIDES, "readonly", (store) => store.get(id)),
    undefined,
  );
  return record ?? null;
}

export async function deleteOfflineRide(id: string): Promise<void> {
  await safe(
    tx(RIDES, "readwrite", (store) => store.delete(id)),
    undefined,
  );
}

export async function listOfflineRideIds(): Promise<string[]> {
  const keys = await safe(
    tx<IDBValidKey[]>(RIDES, "readonly", (store) => store.getAllKeys()),
    [],
  );
  return keys.map(String);
}

export async function listOfflineRides(): Promise<Ride[]> {
  return safe(
    tx<Ride[]>(RIDES, "readonly", (store) => store.getAll()),
    [],
  );
}

/** Cached ride list + profile so the library and units render offline. */
export async function putRideList(rides: RideSummary[]): Promise<void> {
  await safe(
    tx(META, "readwrite", (store) => store.put(rides, "ride-list")),
    undefined,
  );
}

export async function getRideList(): Promise<RideSummary[] | null> {
  const cached = await safe(
    tx<RideSummary[] | undefined>(META, "readonly", (store) => store.get("ride-list")),
    undefined,
  );
  return cached ?? null;
}

export async function putCachedProfile(profile: Profile | null): Promise<void> {
  await safe(
    tx(META, "readwrite", (store) => store.put(profile, "profile")),
    undefined,
  );
}

export async function getCachedProfile(): Promise<Profile | null> {
  const cached = await safe(
    tx<Profile | null | undefined>(META, "readonly", (store) => store.get("profile")),
    undefined,
  );
  return cached ?? null;
}

export async function putOfflineSession(session: RideSession): Promise<void> {
  await safe(
    tx(SESSIONS, "readwrite", (store) => store.put(session)),
    undefined,
  );
}

export async function listOfflineSessions(): Promise<RideSession[]> {
  const sessions = await safe(
    tx<RideSession[]>(SESSIONS, "readonly", (store) => store.getAll()),
    [],
  );
  return sessions.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
}

export async function deleteOfflineSession(id: string): Promise<void> {
  await safe(
    tx(SESSIONS, "readwrite", (store) => store.delete(id)),
    undefined,
  );
}

/** Cached session list for signed-in riders so history renders offline. */
export async function putSessionListCache(sessions: RideSession[]): Promise<void> {
  await safe(
    tx(META, "readwrite", (store) => store.put(sessions, "session-list")),
    undefined,
  );
}

export async function getSessionListCache(): Promise<RideSession[] | null> {
  const cached = await safe(
    tx<RideSession[] | undefined>(META, "readonly", (store) => store.get("session-list")),
    undefined,
  );
  return cached ?? null;
}

/** Wipes every locally cached ride, session, tile index entry and profile snapshot. */
export async function clearOfflineData(): Promise<void> {
  await safe(
    tx(RIDES, "readwrite", (store) => store.clear()),
    undefined as unknown as undefined,
  );
  await safe(
    tx(META, "readwrite", (store) => store.clear()),
    undefined as unknown as undefined,
  );
  await safe(
    tx(SESSIONS, "readwrite", (store) => store.clear()),
    undefined as unknown as undefined,
  );
  if (typeof caches !== "undefined") {
    try {
      // Only drop Hodora's own tile cache — never other origins' or the
      // service worker's precache entries.
      await caches.delete(TILE_CACHE);
    } catch {
      /* ignore */
    }
  }
}
