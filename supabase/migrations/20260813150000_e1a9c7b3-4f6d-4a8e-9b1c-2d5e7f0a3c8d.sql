-- Ride sessions: the actual GPS trace recorded during turn-by-turn
-- navigation, distinct from `rides.points` (the planned/imported route).
-- Powers ride history, weekly stats trends, and "recorded vs. planned" GPX
-- comparison. `ride_id` is nullable with ON DELETE SET NULL, and `ride_name`
-- is denormalized, so a session survives its parent route being deleted —
-- history shouldn't lose entries just because someone cleaned up an old
-- imported route.
CREATE TABLE public.ride_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  ride_id UUID REFERENCES public.rides ON DELETE SET NULL,
  ride_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  ascent_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  descent_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  track JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ride_sessions_user_started_idx ON public.ride_sessions (user_id, started_at DESC);
CREATE INDEX ride_sessions_ride_idx ON public.ride_sessions (ride_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ride_sessions TO authenticated;
GRANT ALL ON public.ride_sessions TO service_role;
ALTER TABLE public.ride_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own ride sessions" ON public.ride_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
