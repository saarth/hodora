CREATE TABLE public.cloud_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('nextcloud', 'google_drive', 'onedrive')),
  webdav_url TEXT,
  webdav_username TEXT,
  encrypted_secret TEXT,
  sync_folder TEXT NOT NULL DEFAULT '/Hodora',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disconnected')),
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  syncing BOOLEAN NOT NULL DEFAULT false,
  sync_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cloud_connections_user_provider_idx ON public.cloud_connections (user_id, provider);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_connections TO authenticated;
GRANT ALL ON public.cloud_connections TO service_role;
ALTER TABLE public.cloud_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own cloud connections" ON public.cloud_connections FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER cloud_connections_set_updated_at BEFORE UPDATE ON public.cloud_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- `ride_id` is intentionally a plain UUID column, not `REFERENCES rides`: a
-- hard FK with ON DELETE CASCADE would wipe this mapping the instant a ride
-- is deleted, before the sync engine ever sees "this ride existed last sync
-- and is now gone" to propagate the delete to the remote file. A mapping
-- whose ride_id no longer resolves in `rides` is itself the delete signal.
CREATE TABLE public.ride_sync_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.cloud_connections ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  ride_id UUID,
  remote_path TEXT NOT NULL,
  remote_etag TEXT,
  remote_updated_at TIMESTAMPTZ,
  local_updated_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Not partial (no `WHERE ride_id IS NOT NULL`): Postgres already treats NULL
-- as distinct from every other NULL under a plain unique index, so multiple
-- NULL ride_ids wouldn't conflict anyway — and keeping it a plain index (vs.
-- partial) lets PostgREST's upsert target it via a simple
-- `ON CONFLICT (connection_id, ride_id)`, which a partial index can't be the
-- target of without the same WHERE clause repeated on the conflict clause.
CREATE UNIQUE INDEX ride_sync_state_connection_ride_idx ON public.ride_sync_state (connection_id, ride_id);
CREATE UNIQUE INDEX ride_sync_state_connection_path_idx ON public.ride_sync_state (connection_id, remote_path);
CREATE INDEX ride_sync_state_user_idx ON public.ride_sync_state (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ride_sync_state TO authenticated;
GRANT ALL ON public.ride_sync_state TO service_role;
ALTER TABLE public.ride_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own ride sync state" ON public.ride_sync_state FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER ride_sync_state_set_updated_at BEFORE UPDATE ON public.ride_sync_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
