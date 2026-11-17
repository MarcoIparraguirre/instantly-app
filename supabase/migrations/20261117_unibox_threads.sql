-- Table: misender.email_threads
CREATE TABLE IF NOT EXISTS misender.email_threads (
    id TEXT PRIMARY KEY,
    lead_email TEXT NOT NULL,
    lead_name TEXT,
    company_name TEXT,
    campaign_name TEXT,
    unread BOOLEAN DEFAULT FALSE,
    ai_sentiment TEXT DEFAULT 'neutral',
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_threads_lead_email ON misender.email_threads(lead_email);
