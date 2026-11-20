ALTER TABLE misender.user_profiles
  ADD COLUMN IF NOT EXISTS allowed_workspace_ids TEXT[] DEFAULT NULL;
ALTER TABLE misender_staging.user_profiles
  ADD COLUMN IF NOT EXISTS allowed_workspace_ids TEXT[] DEFAULT NULL;
NOTIFY pgrst, 'reload schema';
