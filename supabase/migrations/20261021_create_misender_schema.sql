-- Migration: Create isolated 'misender' schema, tables, RLS policies, and seed data for MiSender
-- Project ID: jxkfkcvosfjitrrknwrp

-- 1. Create Schema
CREATE SCHEMA IF NOT EXISTS misender;

-- 2. Grants to Supabase API roles
GRANT USAGE ON SCHEMA misender TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA misender TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA misender TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA misender TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA misender GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA misender GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA misender GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- 3. Workspaces
CREATE TABLE IF NOT EXISTS misender.workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    credits INTEGER DEFAULT 2500,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sender Accounts
CREATE TABLE IF NOT EXISTS misender.sender_accounts (
    id TEXT PRIMARY KEY,
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

-- 5. Campaigns
CREATE TABLE IF NOT EXISTS misender.campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    steps JSONB DEFAULT '[]'::jsonb,
    schedule JSONB DEFAULT '{}'::jsonb,
    sender_account_ids TEXT[] DEFAULT '{}'::text[],
    open_tracking BOOLEAN DEFAULT true,
    click_tracking BOOLEAN DEFAULT false,
    stats JSONB DEFAULT '{"sent":0,"opened":0,"replied":0,"bounced":0,"opportunities":0}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Leads (Stores all custom Google Sheets columns in custom_variables)
CREATE TABLE IF NOT EXISTS misender.leads (
    id TEXT PRIMARY KEY,
    campaign_id TEXT REFERENCES misender.campaigns(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_misender_leads_campaign ON misender.leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_misender_leads_email ON misender.leads(email);

-- 7. Copilot Messages
CREATE TABLE IF NOT EXISTS misender.copilot_messages (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    approval JSONB,
    tool_results JSONB
);

-- 8. Enable Row Level Security and Allow Operations
ALTER TABLE misender.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.sender_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.copilot_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on workspaces' AND tablename = 'workspaces' AND schemaname = 'misender') THEN
        CREATE POLICY "Allow all on workspaces" ON misender.workspaces FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on sender_accounts' AND tablename = 'sender_accounts' AND schemaname = 'misender') THEN
        CREATE POLICY "Allow all on sender_accounts" ON misender.sender_accounts FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on campaigns' AND tablename = 'campaigns' AND schemaname = 'misender') THEN
        CREATE POLICY "Allow all on campaigns" ON misender.campaigns FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on leads' AND tablename = 'leads' AND schemaname = 'misender') THEN
        CREATE POLICY "Allow all on leads" ON misender.leads FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on copilot_messages' AND tablename = 'copilot_messages' AND schemaname = 'misender') THEN
        CREATE POLICY "Allow all on copilot_messages" ON misender.copilot_messages FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 9. Seed Workspaces
INSERT INTO misender.workspaces (id, name, client_name, credits)
VALUES
    ('ws-primary', 'Primary Growth Workspace', 'Internal SaaS', 2500),
    ('ws-agency-1', 'FinTech Labs Outbound', 'Client: FinTech Labs', 1200)
ON CONFLICT (id) DO NOTHING;

-- 10. Seed Sender Accounts
INSERT INTO misender.sender_accounts (
    id, name, email, provider, smtp_host, smtp_port, smtp_user, smtp_pass,
    daily_limit, sent_today, status, warmup_enabled, warmup_today, warmup_total,
    warmup_rescue_rate, health_score, dns_checks
)
VALUES
    (
        'acc-1',
        'Growth Outreach Mailbox 1',
        'alex.morgan@growthpilot.io',
        'google',
        'smtp.gmail.com',
        587,
        'alex.morgan@growthpilot.io',
        'demo-app-pass',
        50,
        18,
        'active',
        true,
        24,
        640,
        98.5,
        98,
        '[
            {"type": "SPF", "valid": true, "current": "v=spf1 include:_spf.google.com ~all", "expected": "v=spf1 include:_spf.google.com ~all", "description": "Authorizes mail server to send on behalf of domain."},
            {"type": "DKIM", "valid": true, "current": "google._domainkey", "expected": "google._domainkey.growthpilot.io (2048-bit RSA)", "description": "Cryptographic signature proving message integrity."},
            {"type": "DMARC", "valid": true, "current": "v=DMARC1; p=quarantine", "expected": "v=DMARC1; p=quarantine; pct=100", "description": "Policy telling receiving servers how to handle non-aligned emails."},
            {"type": "MX", "valid": true, "current": "ASPMX.L.GOOGLE.COM", "expected": "ASPMX.L.GOOGLE.COM (Priority 1)", "description": "Directs incoming emails to mail servers."},
            {"type": "CTD", "valid": true, "current": "track.growthpilot.io", "expected": "inst.growthpilot.io CNAME prox.instantly.ai", "description": "Custom Tracking Domain isolates open/click tracking."}
        ]'::jsonb
    ),
    (
        'acc-2',
        'Sales Direct Mailbox 2',
        'outbound@growthpilot-team.com',
        'microsoft',
        'smtp.office365.com',
        587,
        'outbound@growthpilot-team.com',
        'demo-app-pass',
        40,
        12,
        'active',
        true,
        16,
        410,
        96.0,
        94,
        '[
            {"type": "SPF", "valid": true, "current": "v=spf1 include:spf.protection.outlook.com -all", "expected": "v=spf1 include:spf.protection.outlook.com -all", "description": "Microsoft 365 SPF validation."},
            {"type": "DKIM", "valid": true, "current": "selector1._domainkey.growthpilot-team.com", "expected": "selector1._domainkey.growthpilot-team.com", "description": "DKIM key 2048-bit verification."},
            {"type": "DMARC", "valid": false, "current": "v=DMARC1; p=none", "expected": "v=DMARC1; p=reject", "description": "Warning: DMARC policy is set to none."},
            {"type": "MX", "valid": true, "current": "growthpilotteam-com.mail.protection.outlook.com", "expected": "growthpilotteam-com.mail.protection.outlook.com", "description": "MX routing configured correctly."},
            {"type": "CTD", "valid": true, "current": "track.growthpilot-team.com", "expected": "track.growthpilot-team.com CNAME prox.instantly.ai", "description": "Custom Tracking Domain active."}
        ]'::jsonb
    )
ON CONFLICT (id) DO NOTHING;

-- 11. Seed Campaigns
INSERT INTO misender.campaigns (
    id, name, status, steps, schedule, sender_account_ids, open_tracking, click_tracking, stats
)
VALUES
    (
        'campaign-1',
        'SaaS Outbound Demo Campaign',
        'active',
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
                        "body": "Hi {{firstName}},\n\nNoticed {{companyName}} is expanding outbound sales efforts. We recently helped a similar B2B team book 45 qualified meetings last month by optimizing deliverability and sequence timing.\n\nWould you be open to a 5-minute chat next Tuesday?\n\nBest,\nAlex"
                    }
                ]
            },
            {
                "id": "c31c10bb-8ab1-4cc4-8554-a8e77df676f0",
                "stepNumber": 2,
                "waitDays": 3,
                "variants": [
                    {
                        "id": "4dc29007-137f-49a3-8295-7fb25a9d37a2",
                        "name": "Variant A",
                        "subject": "Re: Quick question for {{firstName}}",
                        "body": "Hi {{firstName}},\n\nJust checking in on my previous email. Let me know if you would be open to a quick call.\n\nBest,\nAlex"
                    }
                ]
            }
        ]'::jsonb,
        '{
            "timing": {"from": "09:00", "to": "17:00"},
            "days": [1, 2, 3, 4, 5],
            "timezone": "America/New_York",
            "dailyLimit": 50,
            "strategy": "office-hours"
        }'::jsonb,
        ARRAY['acc-1'],
        true,
        true,
        '{"sent": 2, "opened": 0, "replied": 0, "bounced": 0, "opportunities": 0}'::jsonb
    )
ON CONFLICT (id) DO NOTHING;

-- 12. Seed Leads
INSERT INTO misender.leads (
    id, campaign_id, email, first_name, last_name, company_name, website, status, current_step, custom_variables
)
VALUES
    ('lead-1', 'campaign-1', 'lead.john@targetco.com', 'John', 'Doe', 'TargetCo', '', 'sent', 1, '{}'::jsonb),
    ('lead-2', 'campaign-1', 'sarah.miller@acmecorp.io', 'Sarah', 'Miller', 'Acme Corp', '', 'sent', 1, '{}'::jsonb),
    ('lead-3', 'campaign-1', 'markisccnv@gmail.com', 'Marco', 'Rojas', 'CCNV', '', 'pending', 1, '{"Cargo": "CEO", "Ciudad": "Buenos Aires"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
