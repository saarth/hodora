-- Route difficulty/surface tagging + segment notes. Both live as plain
-- columns on `rides` rather than separate tables — `notes` in particular is
-- small, always fetched with its ride, and only ever written back as a
-- whole array from the client (same shape as `points`), so a JSONB column
-- avoids a second RLS-guarded table for what is really per-ride metadata.
ALTER TABLE public.rides
  ADD COLUMN difficulty TEXT CHECK (difficulty IN ('easy', 'moderate', 'hard', 'extreme')),
  ADD COLUMN surface TEXT CHECK (surface IN ('paved', 'gravel', 'mixed', 'unpaved')),
  ADD COLUMN notes JSONB NOT NULL DEFAULT '[]'::jsonb;
