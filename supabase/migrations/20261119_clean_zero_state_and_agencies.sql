-- Migration: Clean Zero-State Reset, Agency Hierarchy (agency_id) & Access Codes
-- Project ID: jxkfkcvosfjitrrknwrp

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE misender.workspaces
  ADD COLUMN IF NOT EXISTS agency_id TEXT DEFAULT NULL;
ALTER TABLE misender_staging.workspaces
  ADD COLUMN IF NOT EXISTS agency_id TEXT DEFAULT NULL;

ALTER TABLE misender.user_profiles
  ADD COLUMN IF NOT EXISTS agency_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS access_code TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS allowed_workspace_ids TEXT[] DEFAULT NULL;
ALTER TABLE misender_staging.user_profiles
  ADD COLUMN IF NOT EXISTS agency_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS access_code TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS allowed_workspace_ids TEXT[] DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_misender_workspaces_agency ON misender.workspaces(agency_id);
CREATE INDEX IF NOT EXISTS idx_misender_staging_workspaces_agency ON misender_staging.workspaces(agency_id);
CREATE INDEX IF NOT EXISTS idx_misender_user_profiles_agency ON misender.user_profiles(agency_id);
CREATE INDEX IF NOT EXISTS idx_misender_staging_user_profiles_agency ON misender_staging.user_profiles(agency_id);

-- Wipe demo/operational records in both schemas
DELETE FROM misender.warmup_logs;
DELETE FROM misender.webhooks;
DELETE FROM misender.blocklist;
DELETE FROM misender.deals;
DELETE FROM misender.email_threads;
DELETE FROM misender.copilot_messages;
DELETE FROM misender.leads;
DELETE FROM misender.campaigns;
DELETE FROM misender.sender_accounts;
DELETE FROM misender.user_profiles WHERE id <> 'admin-default';
DELETE FROM misender.workspaces;

DELETE FROM misender_staging.warmup_logs;
DELETE FROM misender_staging.webhooks;
DELETE FROM misender_staging.blocklist;
DELETE FROM misender_staging.deals;
DELETE FROM misender_staging.email_threads;
DELETE FROM misender_staging.copilot_messages;
DELETE FROM misender_staging.leads;
DELETE FROM misender_staging.campaigns;
DELETE FROM misender_staging.sender_accounts;
DELETE FROM misender_staging.user_profiles WHERE id <> 'admin-default';
DELETE FROM misender_staging.workspaces;

-- Ensure only Super Admin profile remains
INSERT INTO misender.user_profiles (id, workspace_id, allowed_workspace_ids, agency_id, full_name, email, company, role_id, access_code)
VALUES ('admin-default', 'ws-founder', ARRAY['ws-founder'], 'ag-founder', 'Marco Iparraguirre', 'marcos@vectrasystems.com.ar', 'Vectra Systems', 'super_admin', 'Vectra2026!')
ON CONFLICT (id) DO UPDATE SET
  workspace_id = EXCLUDED.workspace_id,
  allowed_workspace_ids = EXCLUDED.allowed_workspace_ids,
  agency_id = EXCLUDED.agency_id,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  company = EXCLUDED.company,
  role_id = EXCLUDED.role_id,
  access_code = EXCLUDED.access_code;

INSERT INTO misender_staging.user_profiles (id, workspace_id, allowed_workspace_ids, agency_id, full_name, email, company, role_id, access_code)
VALUES ('admin-default', 'ws-founder', ARRAY['ws-founder'], 'ag-founder', 'Marco Iparraguirre', 'marcos@vectrasystems.com.ar', 'Vectra Systems', 'super_admin', 'Vectra2026!')
ON CONFLICT (id) DO UPDATE SET
  workspace_id = EXCLUDED.workspace_id,
  allowed_workspace_ids = EXCLUDED.allowed_workspace_ids,
  agency_id = EXCLUDED.agency_id,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  company = EXCLUDED.company,
  role_id = EXCLUDED.role_id,
  access_code = EXCLUDED.access_code;

NOTIFY pgrst, 'reload schema';
