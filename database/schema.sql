-- Multipurpose Dealership CRM schema for Supabase/PostgreSQL

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'sales' CHECK (role IN ('admin','sales')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    alternate_phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    area TEXT DEFAULT '',
    district TEXT DEFAULT '',
    profession TEXT DEFAULT '',
    family_members TEXT DEFAULT '',
    vehicle_category TEXT DEFAULT '',
    fuel_type TEXT DEFAULT '',
    car_interest TEXT DEFAULT 'Not Selected',
    variant_interest TEXT DEFAULT '',
    budget_range TEXT DEFAULT '',
    purchase_timeline TEXT DEFAULT '',
    exchange_vehicle TEXT DEFAULT '',
    finance_required TEXT DEFAULT '',
    action_type TEXT DEFAULT 'ENQUIRY',
    lead_type TEXT DEFAULT 'QUICK_ENQUIRY',
    source TEXT DEFAULT 'WEBSITE',
    campaign_name TEXT DEFAULT '',
    tracking JSONB DEFAULT '{}'::jsonb,
    score INTEGER DEFAULT 0,
    priority TEXT DEFAULT 'COLD' CHECK (priority IN ('HOT','WARM','COLD')),
    status TEXT DEFAULT 'NEW' CHECK (status IN ('NEW','CONTACTED','FOLLOW-UP','TEST-DRIVE','BOOKED','CLOSED','LOST')),
    assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT DEFAULT '',
    test_drive_date TIMESTAMPTZ,
    showroom_visit_date TIMESTAMPTZ,
    booking_expected_date TIMESTAMPTZ,
    next_followup_at TIMESTAMPTZ,
    last_followup_at TIMESTAMPTZ,
    followup_count INTEGER DEFAULT 0,
    followup_notes TEXT DEFAULT '',
    lost_reason TEXT DEFAULT '',
    followup_1 TIMESTAMPTZ,
    followup_2 TIMESTAMPTZ,
    followup_3 TIMESTAMPTZ,
    f1_sent BOOLEAN DEFAULT FALSE,
    f2_sent BOOLEAN DEFAULT FALSE,
    f3_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_followups (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT REFERENCES leads(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    followup_type TEXT DEFAULT 'MANUAL',
    call_status TEXT DEFAULT '',
    customer_response TEXT DEFAULT '',
    next_followup_at TIMESTAMPTZ,
    remarks TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communication_logs (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT REFERENCES leads(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    channel TEXT,
    direction TEXT,
    from_number TEXT,
    to_number TEXT,
    status TEXT,
    message TEXT,
    call_duration INTEGER,
    recording_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe upgrade commands for older databases
ALTER TABLE leads ADD COLUMN IF NOT EXISTS alternate_phone TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS family_members TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vehicle_category TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fuel_type TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS variant_interest TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_range TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS purchase_timeline TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS exchange_vehicle TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS finance_required TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_type TEXT DEFAULT 'QUICK_ENQUIRY';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'WEBSITE';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign_name TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS test_drive_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS showroom_visit_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS booking_expected_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_notes TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_reason TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_1 TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_2 TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_3 TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS f1_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS f2_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS f3_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'leads_status_check'
    ) THEN
        ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IN ('NEW','CONTACTED','FOLLOW-UP','TEST-DRIVE','BOOKED','CLOSED','LOST'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_next_followup ON leads(next_followup_at);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followups_lead_id ON lead_followups(lead_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;
