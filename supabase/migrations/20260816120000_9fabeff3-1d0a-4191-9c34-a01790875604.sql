-- Public share links for a ride: a signed-in owner mints a token that lets
-- an anonymous visitor view a read-only wind analysis for one ride at one
-- forecast hour (`/share/:id`). Hard FK + ON DELETE CASCADE is intentional
-- here (unlike ride_sync_state's soft ride_id) — deleting a ride should
-- invalidate its share links immediately, there's no reconciliation loop
-- that needs a dangling row as a signal.
--
-- The wind sample itself (speed/direction/temperature/conditions) is
-- snapshotted at share time rather than just storing `wind_hour` and
-- re-fetching later: Open-Meteo's forecast window is only ~16 days, and a
-- share link should keep showing what conditions were like at share time
-- even after that window passes, without depending on the forecast API
-- still covering that slot.
CREATE TABLE public.shared_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_id UUID NOT NULL REFERENCES public.rides ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  token TEXT NOT NULL,
  wind_hour TIMESTAMPTZ,
  wind_speed_ms REAL,
  wind_direction_deg REAL,
  temperature_c REAL,
  weather_code INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX shared_links_token_idx ON public.shared_links (token);
CREATE INDEX shared_links_user_idx ON public.shared_links (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_links TO authenticated;
GRANT ALL ON public.shared_links TO service_role;
ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;

-- Owners manage their own links via the authenticated client (RLS-scoped);
-- the public share page never reads through RLS at all — it goes through
-- the service-role client in a server route, since an anonymous visitor
-- has no row to be granted access to under `auth.uid() = user_id`.
CREATE POLICY "Users can manage their own shared links" ON public.shared_links FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
