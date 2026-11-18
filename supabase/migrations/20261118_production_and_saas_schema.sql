-- Migration: Production SaaS alterations + Isolated 'misender_staging' schema (12 tables)
-- Project ID: jxkfkcvosfjitrrknwrp
-- Description:
--   1. Create 'misender_staging' schema and expose both 'misender' and 'misender_staging' in PostgREST.
--   2. Alter existing 'misender' production tables to add workspace_id, campaign options, thread metadata, and SaaS billing columns.
--   3. Create all 12 tables in 'misender_staging' with matching types/constraints, RLS, grants, policies, and staging seed data.

-- ============================================================================
-- 1. Create Staging Schema & Expose Both Schemas in PostgREST
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS misender;
CREATE SCHEMA IF NOT EXISTS misender_staging;

ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage, graphql_public, app_gastos, vectra_staging, amani, misender, misender_staging';
NOTIFY pgrst, 'reload config';

-- ============================================================================
-- 2. Production Schema ('misender') Updates & SaaS Multi-Tenancy Columns
-- ============================================================================

-- Ensure roles and user_profiles exist in 'misender' before altering/seeding
CREATE TABLE IF NOT EXISTS misender.roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS misender.user_profiles (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT DEFAULT '',
    role_id TEXT REFERENCES misender.roles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alter misender.email_threads
ALTER TABLE misender.email_threads
    ADD COLUMN IF NOT EXISTS campaign_id TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS lead_id TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS sentiment TEXT DEFAULT 'neutral',
    ADD COLUMN IF NOT EXISTS last_message_snippet TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS sender_account_id TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS workspace_id TEXT DEFAULT 'ws-primary';

-- Alter misender.campaigns
ALTER TABLE misender.campaigns
    ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '{"stopOnReply":true,"stopOnDomainReply":false,"plainTextMode":false,"openTracking":true,"clickTracking":false}'::jsonb,
    ADD COLUMN IF NOT EXISTS workspace_id TEXT DEFAULT 'ws-primary';

-- Alter remaining misender tables adding workspace_id
ALTER TABLE misender.sender_accounts
    ADD COLUMN IF NOT EXISTS workspace_id TEXT DEFAULT 'ws-primary';

ALTER TABLE misender.leads
    ADD COLUMN IF NOT EXISTS workspace_id TEXT DEFAULT 'ws-primary';

ALTER TABLE misender.copilot_messages
    ADD COLUMN IF NOT EXISTS workspace_id TEXT DEFAULT 'ws-primary';

ALTER TABLE misender.warmup_logs
    ADD COLUMN IF NOT EXISTS workspace_id TEXT DEFAULT 'ws-primary';

ALTER TABLE misender.user_profiles
    ADD COLUMN IF NOT EXISTS workspace_id TEXT DEFAULT 'ws-primary';

-- Alter misender.workspaces adding SaaS subscription & ownership columns
ALTER TABLE misender.workspaces
    ADD COLUMN IF NOT EXISTS owner_id TEXT,
    ADD COLUMN IF NOT EXISTS owner_email TEXT,
    ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'growth',
    ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trialing',
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    ADD COLUMN IF NOT EXISTS max_accounts INTEGER DEFAULT 10,
    ADD COLUMN IF NOT EXISTS max_leads INTEGER DEFAULT 10000,
    ADD COLUMN IF NOT EXISTS billing_provider TEXT,
    ADD COLUMN IF NOT EXISTS billing_subscription_id TEXT;

-- Indexes on workspace_id in 'misender'
CREATE INDEX IF NOT EXISTS idx_misender_user_profiles_workspace ON misender.user_profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_sender_accounts_workspace ON misender.sender_accounts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_campaigns_workspace ON misender.campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_leads_workspace ON misender.leads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_copilot_messages_workspace ON misender.copilot_messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_email_threads_workspace ON misender.email_threads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_deals_workspace ON misender.deals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_blocklist_workspace ON misender.blocklist(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_webhooks_workspace ON misender.webhooks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_misender_warmup_logs_workspace ON misender.warmup_logs(workspace_id);

-- Ensure grants & policies on roles, user_profiles, email_threads in 'misender'
GRANT USAGE ON SCHEMA misender TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA misender TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA misender TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA misender TO anon, authenticated, service_role;

ALTER TABLE misender.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.email_threads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on roles' AND tablename = 'roles' AND schemaname = 'misender') THEN
        CREATE POLICY "Allow all on roles" ON misender.roles FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on user_profiles' AND tablename = 'user_profiles' AND schemaname = 'misender') THEN
        CREATE POLICY "Allow all on user_profiles" ON misender.user_profiles FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on email_threads' AND tablename = 'email_threads' AND schemaname = 'misender') THEN
        CREATE POLICY "Allow all on email_threads" ON misender.email_threads FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Seed defaults in 'misender' if missing
INSERT INTO misender.workspaces (id, name, client_name, credits, plan, subscription_status, max_accounts, max_leads)
VALUES
    ('ws-primary', 'Primary Growth Workspace', 'Vectra Systems', 2500, 'growth', 'trialing', 10, 10000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO misender.roles (id, name, description)
VALUES
    ('super_admin', 'Super Admin', 'Control total de la plataforma, bases de datos y envíos masivos.'),
    ('admin', 'Administrador', 'Gestión de campañas, casillas SMTP y carga de prospectos.'),
    ('campaign_manager', 'Gestor de Campañas', 'Creación y redacción de secuencias, plantillas e IA.'),
    ('viewer', 'Solo Lectura', 'Acceso a tableros de analíticas y monitoreo de aperturas.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO misender.user_profiles (id, workspace_id, full_name, email, company, role_id)
VALUES
    ('admin-default', 'ws-primary', 'Marco Iparraguirre', 'marcos@vectrasystems.com.ar', 'Vectra Systems', 'super_admin')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. Staging Schema ('misender_staging') — Exact 12 Tables
-- ============================================================================

-- 3.1 Workspaces
CREATE TABLE IF NOT EXISTS misender_staging.workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    credits INTEGER DEFAULT 2500,
    owner_id TEXT,
    owner_email TEXT,
    plan TEXT DEFAULT 'growth',
    subscription_status TEXT DEFAULT 'trialing',
    trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    max_accounts INTEGER DEFAULT 10,
    max_leads INTEGER DEFAULT 10000,
    billing_provider TEXT,
    billing_subscription_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.2 Roles
CREATE TABLE IF NOT EXISTS misender_staging.roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.3 User Profiles
CREATE TABLE IF NOT EXISTS misender_staging.user_profiles (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT DEFAULT '',
    role_id TEXT REFERENCES misender_staging.roles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_misender_staging_user_profiles_workspace ON misender_staging.user_profiles(workspace_id);

-- 3.4 Sender Accounts
CREATE TABLE IF NOT EXISTS misender_staging.sender_accounts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    provider TEXT DEFAULT 'smtp',
    smtp_host TEXT,
    smtp_port INTEGER DEFAULT 587,
    smtp_user TEXT,
    smtp_pass TEXT,
    daily_limit INTEGER DEFAULT 50,
    sent_today INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    warmup_enabled BOOLEAN DEFAULT true,
    warmup_today INTEGER DEFAULT 0,
    warmup_total INTEGER DEFAULT 0,
    warmup_rescue_rate NUMERIC DEFAULT 100,
    health_score NUMERIC DEFAULT 95,
    dns_checks JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_misender_staging_sender_accounts_workspace ON misender_staging.sender_accounts(workspace_id);

-- 3.5 Campaigns
CREATE TABLE IF NOT EXISTS misender_staging.campaigns (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    name TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    steps JSONB DEFAULT '[]'::jsonb,
    schedule JSONB DEFAULT '{}'::jsonb,
    sender_account_ids TEXT[] DEFAULT '{}'::text[],
    open_tracking BOOLEAN DEFAULT true,
    click_tracking BOOLEAN DEFAULT false,
    options JSONB DEFAULT '{"stopOnReply":true,"stopOnDomainReply":false,"plainTextMode":false,"openTracking":true,"clickTracking":false}'::jsonb,
    stats JSONB DEFAULT '{"sent":0,"opened":0,"replied":0,"bounced":0,"opportunities":0}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_misender_staging_campaigns_workspace ON misender_staging.campaigns(workspace_id);

-- 3.6 Leads
CREATE TABLE IF NOT EXISTS misender_staging.leads (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    campaign_id TEXT REFERENCES misender_staging.campaigns(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    first_name TEXT DEFAULT '',
    last_name TEXT DEFAULT '',
    company_name TEXT DEFAULT '',
    website TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    current_step INTEGER DEFAULT 1,
    last_contacted_at TIMESTAMPTZ,
    custom_variables JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_misender_staging_leads_campaign ON misender_staging.leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_misender_staging_leads_email ON misender_staging.leads(email);
CREATE INDEX IF NOT EXISTS idx_misender_staging_leads_workspace ON misender_staging.leads(workspace_id);

-- 3.7 Copilot Messages
CREATE TABLE IF NOT EXISTS misender_staging.copilot_messages (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    approval JSONB,
    tool_results JSONB
);

CREATE INDEX IF NOT EXISTS idx_misender_staging_copilot_messages_workspace ON misender_staging.copilot_messages(workspace_id);

-- 3.8 Email Threads (Unibox)
CREATE TABLE IF NOT EXISTS misender_staging.email_threads (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    campaign_id TEXT DEFAULT '',
    lead_id TEXT DEFAULT '',
    lead_email TEXT NOT NULL,
    lead_name TEXT,
    company_name TEXT,
    campaign_name TEXT,
    unread BOOLEAN DEFAULT FALSE,
    sentiment TEXT DEFAULT 'neutral',
    ai_sentiment TEXT DEFAULT 'neutral',
    last_message_snippet TEXT DEFAULT '',
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    sender_account_id TEXT DEFAULT '',
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_misender_staging_email_threads_lead_email ON misender_staging.email_threads(lead_email);
CREATE INDEX IF NOT EXISTS idx_misender_staging_email_threads_workspace ON misender_staging.email_threads(workspace_id);

-- 3.9 Deals (CRM Pipeline)
CREATE TABLE IF NOT EXISTS misender_staging.deals (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    lead_id TEXT,
    contact_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    company_name TEXT DEFAULT '',
    title TEXT NOT NULL,
    value NUMERIC DEFAULT 0,
    stage TEXT DEFAULT 'positive',
    days_inactive INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_misender_staging_deals_workspace ON misender_staging.deals(workspace_id);

-- 3.10 Blocklist (Global Suppressions)
CREATE TABLE IF NOT EXISTS misender_staging.blocklist (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    reason TEXT DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_misender_staging_blocklist_val ON misender_staging.blocklist(value);
CREATE INDEX IF NOT EXISTS idx_misender_staging_blocklist_workspace ON misender_staging.blocklist(workspace_id);

-- 3.11 Webhooks
CREATE TABLE IF NOT EXISTS misender_staging.webhooks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    url TEXT NOT NULL,
    event_types TEXT[] DEFAULT ARRAY['lead.replied', 'lead.bounced', 'lead.unsubscribed', 'email.sent']::text[],
    is_active BOOLEAN DEFAULT true,
    secret TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_misender_staging_webhooks_workspace ON misender_staging.webhooks(workspace_id);

-- 3.12 Warmup Logs
CREATE TABLE IF NOT EXISTS misender_staging.warmup_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    from_account_id TEXT NOT NULL,
    to_account_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT DEFAULT 'sent',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_misender_staging_warmup_logs_workspace ON misender_staging.warmup_logs(workspace_id);

-- ============================================================================
-- 4. Grants, RLS & Permissive Policies on 'misender_staging'
-- ============================================================================
GRANT USAGE ON SCHEMA misender_staging TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA misender_staging TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA misender_staging TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA misender_staging TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA misender_staging GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA misender_staging GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA misender_staging GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

ALTER TABLE misender_staging.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.sender_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.copilot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.blocklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender_staging.warmup_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on workspaces' AND tablename = 'workspaces' AND schemaname = 'misender_staging') THEN
        CREATE POLICY "Allow all on workspaces" ON misender_staging.workspaces FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on roles' AND tablename = 'roles' AND schemaname = 'misender_staging') THEN
        CREATE POLICY "Allow all on roles" ON misender_staging.roles FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on user_profiles' AND tablename = 'user_profiles' AND schemaname = 'misender_staging') THEN
        CREATE POLICY "Allow all on user_profiles" ON misender_staging.user_profiles FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on sender_accounts' AND tablename = 'sender_accounts' AND schemaname = 'misender_staging') THEN
        CREATE POLICY "Allow all on sender_accounts" ON misender_staging.sender_accounts FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on campaigns' AND tablename = 'campaigns' AND schemaname = 'misender_staging') THEN
        CREATE POLICY "Allow all on campaigns" ON misender_staging.campaigns FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on leads' AND tablename = 'leads' AND schemaname = 'misender_staging') THEN
        CREATE POLICY "Allow all on leads" ON misender_staging.leads FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on copilot_messages' AND tablename = 'copilot_messages' AND schemaname = 'misender_staging') THEN
        CREATE POLICY "Allow all on copilot_messages" ON misender_staging.copilot_messages FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on email_threads' AND tablename = 'email_threads' AND schemaname = 'misender_staging') THEN
        CREATE POLICY "Allow all on email_threads" ON misender_staging.email_threads FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on deals' AND tablename = 'deals' AND schemaname = 'misender_staging') THEN
        CREATE POLICY "Allow all on deals" ON misender_staging.deals FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on blocklist' AND tablename = 'blocklist' AND schemaname = 'misender_staging') THEN
        CREATE POLICY "Allow all on blocklist" ON misender_staging.blocklist FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on webhooks' AND tablename = 'webhooks' AND schemaname = 'misender_staging') THEN
        CREATE POLICY "Allow all on webhooks" ON misender_staging.webhooks FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on warmup_logs' AND tablename = 'warmup_logs' AND schemaname = 'misender_staging') THEN
        CREATE POLICY "Allow all on warmup_logs" ON misender_staging.warmup_logs FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ============================================================================
-- 5. Staging Seed Data ('misender_staging')
-- ============================================================================

-- Workspaces
INSERT INTO misender_staging.workspaces (id, name, client_name, credits, plan, subscription_status, max_accounts, max_leads)
VALUES
    ('ws-primary', 'Primary Growth Workspace', 'Vectra Systems (Staging)', 2500, 'growth', 'trialing', 10, 10000),
    ('ws-agency-demo', 'Agency Demo Workspace', 'Client: FinTech Labs', 5000, 'agency', 'active', 999, 50000)
ON CONFLICT (id) DO NOTHING;

-- Roles
INSERT INTO misender_staging.roles (id, name, description)
VALUES
    ('super_admin', 'Super Admin', 'Control total de la plataforma, bases de datos y envíos masivos.'),
    ('admin', 'Administrador', 'Gestión de campañas, casillas SMTP y carga de prospectos.'),
    ('campaign_manager', 'Gestor de Campañas', 'Creación y redacción de secuencias, plantillas e IA.'),
    ('viewer', 'Solo Lectura', 'Acceso a tableros de analíticas y monitoreo de aperturas.')
ON CONFLICT (id) DO NOTHING;

-- Default Admin Profile
INSERT INTO misender_staging.user_profiles (id, workspace_id, full_name, email, company, role_id)
VALUES
    ('admin-default', 'ws-primary', 'Marco Iparraguirre', 'marcos@vectrasystems.com.ar', 'Vectra Systems', 'super_admin')
ON CONFLICT (id) DO NOTHING;

-- Sample Staging Sender Account (if empty)
INSERT INTO misender_staging.sender_accounts (
    id, workspace_id, name, email, provider, smtp_host, smtp_port, smtp_user, smtp_pass,
    daily_limit, sent_today, status, warmup_enabled, warmup_today, warmup_total,
    warmup_rescue_rate, health_score, dns_checks
)
SELECT
    'acc-staging-1',
    'ws-primary',
    'Staging Outreach Mailbox 1',
    'alex.staging@growthpilot.io',
    'google',
    'smtp.gmail.com',
    587,
    'alex.staging@growthpilot.io',
    'demo-app-pass',
    50,
    4,
    'active',
    true,
    12,
    240,
    98.5,
    97,
    '[
        {"type": "SPF", "valid": true, "current": "v=spf1 include:_spf.google.com ~all", "expected": "v=spf1 include:_spf.google.com ~all", "description": "Authorizes mail server to send on behalf of domain."},
        {"type": "DKIM", "valid": true, "current": "google._domainkey", "expected": "google._domainkey.growthpilot.io (2048-bit RSA)", "description": "Cryptographic signature proving message integrity."},
        {"type": "DMARC", "valid": true, "current": "v=DMARC1; p=quarantine", "expected": "v=DMARC1; p=quarantine; pct=100", "description": "Policy telling receiving servers how to handle non-aligned emails."},
        {"type": "MX", "valid": true, "current": "ASPMX.L.GOOGLE.COM", "expected": "ASPMX.L.GOOGLE.COM (Priority 1)", "description": "Directs incoming emails to mail servers."},
        {"type": "CTD", "valid": true, "current": "track.growthpilot.io", "expected": "inst.growthpilot.io CNAME prox.instantly.ai", "description": "Custom Tracking Domain isolates open/click tracking."}
    ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM misender_staging.sender_accounts);

-- Sample Staging Campaign (if empty)
INSERT INTO misender_staging.campaigns (
    id, workspace_id, name, status, steps, schedule, sender_account_ids,
    open_tracking, click_tracking, options, stats
)
SELECT
    'camp-staging-1',
    'ws-primary',
    'Staging SaaS Outbound Campaign',
    'draft',
    '[
        {
            "id": "step-1",
            "stepNumber": 1,
            "waitDays": 0,
            "variants": [
                {
                    "id": "var-1",
                    "name": "Variant A",
                    "subject": "Quick question regarding {{companyName}}",
                    "body": "Hi {{firstName}},\n\nNoticed {{companyName}} is scaling outbound outreach. Would you be open to a quick 5-minute chat?\n\nBest,\nAlex"
                }
            ]
        },
        {
            "id": "step-2",
            "stepNumber": 2,
            "waitDays": 3,
            "variants": [
                {
                    "id": "var-2",
                    "name": "Variant A",
                    "subject": "Re: Quick question regarding {{companyName}}",
                    "body": "Hi {{firstName}},\n\nJust floating this back to the top of your inbox.\n\nBest,\nAlex"
                }
            ]
        }
    ]'::jsonb,
    '{"timing":{"from":"09:00","to":"17:00"},"days":[1,2,3,4,5],"timezone":"America/New_York","dailyLimit":50,"strategy":"office-hours"}'::jsonb,
    ARRAY['acc-staging-1'],
    true,
    false,
    '{"stopOnReply":true,"stopOnDomainReply":false,"plainTextMode":false,"openTracking":true,"clickTracking":false}'::jsonb,
    '{"sent":0,"opened":0,"replied":0,"bounced":0,"opportunities":0}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM misender_staging.campaigns);

-- Sample Staging Leads (if empty and sample campaign exists)
INSERT INTO misender_staging.leads (
    id, workspace_id, campaign_id, email, first_name, last_name, company_name, website, status, current_step, custom_variables
)
SELECT * FROM (VALUES
    ('lead-staging-1', 'ws-primary', 'camp-staging-1', 'john.doe@targetco-staging.test', 'John', 'Doe', 'TargetCo', 'https://targetco.example.com', 'pending', 1, '{"Cargo":"VP Sales"}'::jsonb),
    ('lead-staging-2', 'ws-primary', 'camp-staging-1', 'sarah.miller@acmecorp-staging.test', 'Sarah', 'Miller', 'Acme Corp', 'https://acmecorp.example.com', 'pending', 1, '{"Cargo":"Head of Growth"}'::jsonb)
) AS v(id, workspace_id, campaign_id, email, first_name, last_name, company_name, website, status, current_step, custom_variables)
WHERE NOT EXISTS (SELECT 1 FROM misender_staging.leads)
  AND EXISTS (SELECT 1 FROM misender_staging.campaigns WHERE id = 'camp-staging-1');
