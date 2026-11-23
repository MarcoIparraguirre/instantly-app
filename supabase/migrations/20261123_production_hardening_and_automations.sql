-- Migration: 20261123_production_hardening_and_automations.sql
-- Description:
--   1. Seal anon schema/table access across both 'misender' and 'misender_staging'.
--   2. Extend sender_accounts with bounce tracking, warmup ramp & rotation timestamps.
--   3. Create automation_rules, automation_runs, rate_limits, system_locks, audit_logs,
--      seed_mailboxes, and api_keys in both schemas with RLS, service_role grants, and indexes.

-- ============================================================================
-- 1. Revoke Anonymous Public Access (Both Schemas)
-- ============================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA misender FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA misender FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA misender FROM anon;
REVOKE USAGE ON SCHEMA misender FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA misender REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA misender REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA misender REVOKE ALL ON ROUTINES FROM anon;

REVOKE ALL ON ALL TABLES IN SCHEMA misender_staging FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA misender_staging FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA misender_staging FROM anon;
REVOKE USAGE ON SCHEMA misender_staging FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA misender_staging REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA misender_staging REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA misender_staging REVOKE ALL ON ROUTINES FROM anon;

GRANT USAGE ON SCHEMA misender TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA misender TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA misender TO service_role;

GRANT USAGE ON SCHEMA misender_staging TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA misender_staging TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA misender_staging TO service_role;

-- ============================================================================
-- 2. Extend sender_accounts for Deliverability Guard, Warmup Ramp & Rotation
-- ============================================================================
ALTER TABLE misender.sender_accounts
    ADD COLUMN IF NOT EXISTS bounce_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_sent INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS warmup_ramp_day INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS warmup_network_opt_in BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS paused_reason TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE misender_staging.sender_accounts
    ADD COLUMN IF NOT EXISTS bounce_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_sent INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS warmup_ramp_day INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS warmup_network_opt_in BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS paused_reason TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NULL;

-- ============================================================================
-- 3. New Tables in Production Schema ('misender')
-- ============================================================================
CREATE TABLE IF NOT EXISTS misender.automation_rules (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    trigger_event TEXT NOT NULL,
    conditions JSONB DEFAULT '{}'::jsonb,
    actions JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    run_count INTEGER DEFAULT 0,
    last_run_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS misender.automation_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    rule_id TEXT,
    rule_name TEXT DEFAULT '',
    trigger_event TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    payload JSONB DEFAULT '{}'::jsonb,
    action_results JSONB DEFAULT '[]'::jsonb,
    error_message TEXT DEFAULT NULL,
    duration_ms INTEGER DEFAULT 0,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS misender.rate_limits (
    key TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    bucket TEXT NOT NULL DEFAULT 'default',
    count INTEGER NOT NULL DEFAULT 1,
    reset_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS misender.system_locks (
    lock_key TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-global',
    owner_id TEXT DEFAULT NULL,
    locked_until TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS misender.audit_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    actor_id TEXT DEFAULT NULL,
    actor_email TEXT DEFAULT NULL,
    action TEXT NOT NULL,
    resource_type TEXT DEFAULT NULL,
    resource_id TEXT DEFAULT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT DEFAULT NULL,
    user_agent TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS misender.seed_mailboxes (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    email TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'smtp',
    imap_host TEXT DEFAULT NULL,
    imap_port INTEGER DEFAULT 993,
    imap_user TEXT DEFAULT NULL,
    imap_pass TEXT DEFAULT NULL,
    is_active BOOLEAN DEFAULT true,
    last_checked_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS misender.api_keys (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL DEFAULT 'ws-primary',
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    scopes TEXT[] DEFAULT ARRAY['read', 'write']::text[],
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ DEFAULT NULL,
    expires_at TIMESTAMPTZ DEFAULT NULL,
    created_by TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes on workspace_id & operational keys ('misender')
CREATE INDEX IF NOT EXISTS idx_misender_automation_rules_workspace ON misender.automation_rules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_automation_rules_trigger ON misender.automation_rules(workspace_id, trigger_event, is_active);
CREATE INDEX IF NOT EXISTS idx_misender_automation_runs_workspace ON misender.automation_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_automation_runs_rule ON misender.automation_runs(rule_id);
CREATE INDEX IF NOT EXISTS idx_misender_rate_limits_workspace ON misender.rate_limits(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_rate_limits_reset ON misender.rate_limits(reset_at);
CREATE INDEX IF NOT EXISTS idx_misender_system_locks_workspace ON misender.system_locks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_audit_logs_workspace ON misender.audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_audit_logs_created ON misender.audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_misender_seed_mailboxes_workspace ON misender.seed_mailboxes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_api_keys_workspace ON misender.api_keys(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_api_keys_hash ON misender.api_keys(key_hash);

-- ============================================================================
-- 4. New Tables in Staging Schema ('misender_staging')
-- ============================================================================
CREATE TABLE IF NOT EXISTS misender_staging.automation_rules (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    trigger_event TEXT NOT NULL,
    conditions JSONB DEFAULT '{}'::jsonb,
    actions JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    run_count INTEGER DEFAULT 0,
    last_run_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS misender_staging.automation_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    rule_id TEXT,
    rule_name TEXT DEFAULT '',
    trigger_event TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    payload JSONB DEFAULT '{}'::jsonb,
    action_results JSONB DEFAULT '[]'::jsonb,
    error_message TEXT DEFAULT NULL,
    duration_ms INTEGER DEFAULT 0,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS misender_staging.rate_limits (
    key TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    bucket TEXT NOT NULL DEFAULT 'default',
    count INTEGER NOT NULL DEFAULT 1,
    reset_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS misender_staging.system_locks (
    lock_key TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-global',
    owner_id TEXT DEFAULT NULL,
    locked_until TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS misender_staging.audit_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    actor_id TEXT DEFAULT NULL,
    actor_email TEXT DEFAULT NULL,
    action TEXT NOT NULL,
    resource_type TEXT DEFAULT NULL,
    resource_id TEXT DEFAULT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT DEFAULT NULL,
    user_agent TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS misender_staging.seed_mailboxes (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    email TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'smtp',
    imap_host TEXT DEFAULT NULL,
    imap_port INTEGER DEFAULT 993,
    imap_user TEXT DEFAULT NULL,
    imap_pass TEXT DEFAULT NULL,
    is_active BOOLEAN DEFAULT true,
    last_checked_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS misender_staging.api_keys (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL DEFAULT 'ws-primary',
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    scopes TEXT[] DEFAULT ARRAY['read', 'write']::text[],
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ DEFAULT NULL,
    expires_at TIMESTAMPTZ DEFAULT NULL,
    created_by TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes on workspace_id & operational keys ('misender_staging')
CREATE INDEX IF NOT EXISTS idx_misender_staging_automation_rules_workspace ON misender_staging.automation_rules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_staging_automation_rules_trigger ON misender_staging.automation_rules(workspace_id, trigger_event, is_active);
CREATE INDEX IF NOT EXISTS idx_misender_staging_automation_runs_workspace ON misender_staging.automation_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_staging_automation_runs_rule ON misender_staging.automation_runs(rule_id);
CREATE INDEX IF NOT EXISTS idx_misender_staging_rate_limits_workspace ON misender_staging.rate_limits(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_staging_rate_limits_reset ON misender_staging.rate_limits(reset_at);
CREATE INDEX IF NOT EXISTS idx_misender_staging_system_locks_workspace ON misender_staging.system_locks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_staging_audit_logs_workspace ON misender_staging.audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_staging_audit_logs_created ON misender_staging.audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_misender_staging_seed_mailboxes_workspace ON misender_staging.seed_mailboxes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_staging_api_keys_workspace ON misender_staging.api_keys(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_staging_api_keys_hash ON misender_staging.api_keys(key_hash);

-- ============================================================================
-- 5. Enable RLS, Service Role Grants & Policies (Both Schemas)
-- ============================================================================
ALTER TABLE misender.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.system_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.seed_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.api_keys ENABLE ROW LEVEL SECURITY;

ALTER TABLE misender_staging.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.system_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.seed_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.api_keys ENABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA misender TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA misender TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA misender_staging TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA misender_staging TO service_role;

-- Ensure anon remains explicitly revoked on all newly created tables too
REVOKE ALL ON ALL TABLES IN SCHEMA misender FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA misender_staging FROM anon;

DO $$
DECLARE
    sch TEXT;
    tbl TEXT;
BEGIN
    FOREACH sch IN ARRAY ARRAY['misender', 'misender_staging'] LOOP
        FOREACH tbl IN ARRAY ARRAY[
            'automation_rules',
            'automation_runs',
            'rate_limits',
            'system_locks',
            'audit_logs',
            'seed_mailboxes',
            'api_keys'
        ] LOOP
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE policyname = 'Service role full access'
                  AND tablename = tbl
                  AND schemaname = sch
            ) THEN
                EXECUTE format(
                    'CREATE POLICY "Service role full access" ON %I.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
                    sch,
                    tbl
                );
            END IF;
        END LOOP;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
