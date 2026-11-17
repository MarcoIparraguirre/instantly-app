-- Migration: In-House Features (Deals, Blocklist, Webhooks, Warmup Logs)
-- Schema: misender
-- Project ID: jxkfkcvosfjitrrknwrp

-- 1. Deals (CRM Pipeline)
CREATE TABLE IF NOT EXISTS misender.deals (
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

-- 2. Blocklist (Global Suppressions)
CREATE TABLE IF NOT EXISTS misender.blocklist (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    type TEXT NOT NULL, -- 'email' | 'domain'
    value TEXT NOT NULL, -- normalized lower-case email or domain
    reason TEXT DEFAULT 'manual', -- 'unsubscribed' | 'bounced' | 'manual' | 'spam_complaint'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_misender_blocklist_val ON misender.blocklist(value);

-- 3. Webhooks (External Automation Integrations)
CREATE TABLE IF NOT EXISTS misender.webhooks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-primary',
    url TEXT NOT NULL,
    event_types TEXT[] DEFAULT ARRAY['lead.replied', 'lead.bounced', 'lead.unsubscribed', 'email.sent']::text[],
    is_active BOOLEAN DEFAULT true,
    secret TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Warmup Logs (Internal P2P Network Activity)
CREATE TABLE IF NOT EXISTS misender.warmup_logs (
    id TEXT PRIMARY KEY,
    from_account_id TEXT NOT NULL,
    to_account_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT DEFAULT 'sent',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RLS & Permissions
ALTER TABLE misender.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.blocklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE misender.warmup_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on deals' AND tablename = 'deals' AND schemaname = 'misender') THEN
        CREATE POLICY "Allow all on deals" ON misender.deals FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on blocklist' AND tablename = 'blocklist' AND schemaname = 'misender') THEN
        CREATE POLICY "Allow all on blocklist" ON misender.blocklist FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on webhooks' AND tablename = 'webhooks' AND schemaname = 'misender') THEN
        CREATE POLICY "Allow all on webhooks" ON misender.webhooks FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on warmup_logs' AND tablename = 'warmup_logs' AND schemaname = 'misender') THEN
        CREATE POLICY "Allow all on warmup_logs" ON misender.warmup_logs FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 6. Seed initial deals if table is empty
INSERT INTO misender.deals (id, lead_id, contact_name, contact_email, company_name, title, value, stage, days_inactive)
VALUES
    ('deal-1', 'lead-1', 'John Doe', 'lead.john@targetco.com', 'TargetCo', 'TargetCo Enterprise Deal', 12000, 'positive', 1),
    ('deal-2', 'lead-2', 'Sarah Miller', 'sarah.miller@acmecorp.io', 'Acme Corp', 'Acme Corp Pilot Outbound', 4500, 'demo', 2),
    ('deal-3', 'lead-3', 'Marco Rojas', 'markisccnv@gmail.com', 'CCNV', 'Growth Outreach Partnership', 8500, 'proposal', 0)
ON CONFLICT (id) DO NOTHING;
