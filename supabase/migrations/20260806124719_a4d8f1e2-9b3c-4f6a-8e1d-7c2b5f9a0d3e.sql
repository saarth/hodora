-- OAuth-based providers (Google Drive, OneDrive) don't have a WebDAV
-- URL/username the way Nextcloud does, but they do need somewhere to keep
-- the account's display email (for the Connections UI) and, for Google
-- Drive only, the sync folder's Drive file ID — the Drive API has no path
-- addressing, so the folder has to be found-or-created once and its ID
-- cached rather than re-resolved by name on every sync. OneDrive addresses
-- its special "app root" folder by path, so it doesn't need this.
ALTER TABLE public.cloud_connections
  ADD COLUMN account_email TEXT,
  ADD COLUMN remote_folder_id TEXT;
