-- Migration: 20261118_harden_rls.sql
-- Description: Hardening of Row Level Security (RLS) across all tables in schema misender
-- Security Audit Reference: SEC-04 (Universal permissive RLS policies)

-- 1. Ensure RLS is active on all misender tables
ALTER TABLE misender.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.sender_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.copilot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.blocklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.warmup_logs ENABLE ROW LEVEL SECURITY;

-- 2. Grant permissions explicitly to authenticated and service_role
GRANT USAGE ON SCHEMA misender TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA misender TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA misender TO authenticated, service_role;

-- 3. Production Hardening Directive:
-- In production with SUPABASE_SERVICE_ROLE_KEY configured on the Next.js backend,
-- execute the following to seal public anon access from external internet:
-- REVOKE ALL ON ALL TABLES IN SCHEMA misender FROM anon;
-- REVOKE USAGE ON SCHEMA misender FROM anon;
