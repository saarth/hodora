/**
 * Voice turn announcements during navigation, via the browser's built-in
 * Web Speech API (SpeechSynthesis) — no key/service needed, same "no keys"
 * spirit as the rest of the app. `nextTurnAnnouncement` is a pure function
 * (same pattern as `findProximityAlert` in nav.ts) so the distance-threshold
 * logic is testable without a real SpeechSynthesis implementation.
 */

const STORAGE_KEY = "hodora-nav-voice";

export function isVoiceSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function getVoicePreference(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setVoicePreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

/** Speaks `text` immediately, replacing anything still queued — a stale announcement finishing late is worse than skipping it. */
export function speak(text: string): void {
  if (!isVoiceSupported()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

/** Distance thresholds (meters) an announcement fires at, checked nearest-first. */
const THRESHOLDS_M = [300, 100, 30] as const;
export type AnnouncementThresholdM = (typeof THRESHOLDS_M)[number];

/**
 * Picks the next threshold to announce for the turn at `turnIndex`, or null
 * if none has newly been crossed. `announced` keys are `${turnIndex}:${thresholdM}`
 * so a fresh turn (a new index) always gets its own announcements even if an
 * earlier turn used the same threshold values.
 */
export function nextTurnAnnouncement(
  turnIndex: number,
  turnDistanceM: number,
  announced: ReadonlySet<string>,
): { key: string; thresholdM: AnnouncementThresholdM } | null {
  for (const thresholdM of THRESHOLDS_M) {
    const key = `${turnIndex}:${thresholdM}`;
    if (turnDistanceM <= thresholdM && !announced.has(key)) {
      return { key, thresholdM };
    }
  }
  return null;
}

/** Spoken-friendly distance phrase for an announcement threshold, e.g. "300 meters" / "1,000 feet". */
export function speakableDistance(thresholdM: number, metric: boolean): string {
  if (metric) return `${thresholdM} meters`;
  const feet = Math.round((thresholdM * 3.28084) / 10) * 10;
  return `${feet} feet`;
}
