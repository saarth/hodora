export type WeeklyStat = {
  /** ISO date (UTC, YYYY-MM-DD) of the Monday that starts this week */
  weekStart: string;
  distanceM: number;
  ascentM: number;
  rideCount: number;
};

function mondayOf(date: Date): Date {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (day + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - daysSinceMonday);
  return utc;
}

/**
 * Buckets sessions into Monday-starting weekly totals, for the most recent
 * `weeks` weeks (including this week). Weeks with no rides still appear with
 * zero totals so a trend chart's x-axis stays continuous instead of skipping
 * quiet weeks.
 */
export function weeklyStats(
  sessions: { started_at: string; distance_m: number; ascent_m: number }[],
  weeks = 8,
  now: Date = new Date(),
): WeeklyStat[] {
  const buckets = new Map<string, WeeklyStat>();
  const thisMonday = mondayOf(now);

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(thisMonday);
    weekStart.setUTCDate(weekStart.getUTCDate() - i * 7);
    const key = weekStart.toISOString().slice(0, 10);
    buckets.set(key, { weekStart: key, distanceM: 0, ascentM: 0, rideCount: 0 });
  }

  for (const session of sessions) {
    const key = mondayOf(new Date(session.started_at)).toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue; // outside the requested window
    bucket.distanceM += session.distance_m;
    bucket.ascentM += session.ascent_m;
    bucket.rideCount += 1;
  }

  return Array.from(buckets.values());
}
