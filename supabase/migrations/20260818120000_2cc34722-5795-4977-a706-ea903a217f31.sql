-- Cue sheets, planner round-tripping, and GPS-recorded rides.
--
-- `cues` holds the turn-by-turn step list a router returned (or that was
-- recovered from a GPX import by re-routing it) alongside `points`, instead
-- of throwing that information away once the geometry is drawn — same JSONB
-- write-the-whole-array-back shape as `notes`.
--
-- `plan_waypoints`/`plan_profile` are only set for routes created on the
-- /plan page: the tapped waypoints and chosen BRouter profile, kept
-- separately from the routed `points` so a route can be reopened in the
-- planner and re-routed/re-saved later ("route editing after save") without
-- trying to reverse-engineer waypoints out of a dense path. NULL for
-- imported/recorded/explored rides, which have no planner waypoints to
-- return to.
--
-- `is_recorded` marks a ride captured live via /record (a GPS track with no
-- pre-existing route to follow) rather than imported or planned — its
-- `points` carry a `t` (elapsed seconds) field the others don't, used to
-- show post-ride moving time/average speed.
ALTER TABLE public.rides
  ADD COLUMN cues JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN plan_waypoints JSONB,
  ADD COLUMN plan_profile TEXT CHECK (plan_profile IN ('trekking', 'fastbike', 'safety')),
  ADD COLUMN is_recorded BOOLEAN NOT NULL DEFAULT false;
