-- Multipurpose Dealership CRM schema for Supabase/PostgreSQL

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'sales' CHECK (role IN ('admin','sales')),
    phone TEXT DEFAULT '',
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
    preferred_color TEXT DEFAULT '',
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
    competitor_model TEXT DEFAULT '',
    followup_1 TIMESTAMPTZ,
    followup_2 TIMESTAMPTZ,
    followup_3 TIMESTAMPTZ,
    f1_sent BOOLEAN DEFAULT FALSE,
    f2_sent BOOLEAN DEFAULT FALSE,
    f3_sent BOOLEAN DEFAULT FALSE,
    reminder_sent BOOLEAN DEFAULT FALSE,
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


CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT REFERENCES leads(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    old_value TEXT DEFAULT '',
    new_value TEXT DEFAULT '',
    remarks TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_lead_id ON activity_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

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

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;
UPDATE leads SET vehicle_category = 'AD' WHERE vehicle_category = 'ICE';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS alternate_phone TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS family_members TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vehicle_category TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fuel_type TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS variant_interest TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS preferred_color TEXT DEFAULT '';
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
ALTER TABLE leads ADD COLUMN IF NOT EXISTS competitor_model TEXT DEFAULT '';
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


CREATE TABLE IF NOT EXISTS report_logs (
    id BIGSERIAL PRIMARY KEY,
    report_type TEXT,
    report_date DATE,
    date_from TIMESTAMPTZ,
    date_to TIMESTAMPTZ,
    sent_to_email TEXT,
    sent_to_whatsapp TEXT,
    status TEXT DEFAULT 'GENERATED',
    summary JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_logs_created_at ON report_logs(created_at DESC);

-- =====================================================
-- CRM Master Modules Safe Upgrade: Departments, Roles, Permissions
-- Added by ChatGPT patch. Safe to run multiple times.
-- =====================================================
CREATE TABLE IF NOT EXISTS departments (
    id BIGSERIAL PRIMARY KEY,
    name TEXT,
    code TEXT,
    department_name TEXT,
    department_code TEXT,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE departments ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS department_name TEXT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS department_code TEXT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE departments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
ALTER TABLE departments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE departments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE departments
SET
    name = COALESCE(NULLIF(name, ''), department_name),
    code = COALESCE(NULLIF(code, ''), department_code),
    department_name = COALESCE(NULLIF(department_name, ''), name),
    department_code = COALESCE(NULLIF(department_code, ''), code),
    status = COALESCE(NULLIF(status, ''), 'ACTIVE');

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_code_unique ON departments (LOWER(code)) WHERE code IS NOT NULL AND code <> '';
CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status);

INSERT INTO departments (name, code, department_name, department_code, description, status)
VALUES
    ('Admin', 'ADMIN', 'Admin', 'ADMIN', 'Administration department', 'ACTIVE'),
    ('Sales', 'SALES', 'Sales', 'SALES', 'Sales department', 'ACTIVE'),
    ('Marketing', 'MARKETING', 'Marketing', 'MARKETING', 'Marketing department', 'ACTIVE'),
    ('Service', 'SERVICE', 'Service', 'SERVICE', 'Service department', 'ACTIVE'),
    ('Accessories', 'ACCESSORIES', 'Accessories', 'ACCESSORIES', 'Accessories department', 'ACTIVE'),
    ('Finance', 'FINANCE', 'Finance', 'FINANCE', 'Finance department', 'ACTIVE'),
    ('Insurance', 'INSURANCE', 'Insurance', 'INSURANCE', 'Insurance department', 'ACTIVE'),
    ('Field Team', 'FIELD', 'Field Team', 'FIELD', 'Field activity department', 'ACTIVE')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS roles (
    id BIGSERIAL PRIMARY KEY,
    role_name TEXT NOT NULL,
    role_code TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id BIGSERIAL PRIMARY KEY,
    permission_name TEXT NOT NULL,
    permission_code TEXT NOT NULL UNIQUE,
    module_name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    id BIGSERIAL PRIMARY KEY,
    role_id BIGINT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id BIGINT REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_roles_status ON roles(status);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module_name);

INSERT INTO permissions (permission_name, permission_code, module_name, description)
VALUES
    ('View Leads', 'leads.view', 'Leads', 'Can view leads'),
    ('Create Leads', 'leads.create', 'Leads', 'Can create leads'),
    ('Edit Leads', 'leads.edit', 'Leads', 'Can edit lead details'),
    ('Assign Leads', 'leads.assign', 'Leads', 'Can assign leads'),
    ('Export Leads', 'leads.export', 'Leads', 'Can export leads'),
    ('View Follow-ups', 'followups.view', 'Follow-ups', 'Can view follow-ups'),
    ('Create Follow-ups', 'followups.create', 'Follow-ups', 'Can create follow-ups'),
    ('View Reports', 'reports.view', 'Reports', 'Can view reports'),
    ('Send Reports', 'reports.send', 'Reports', 'Can send reports'),
    ('Manage Branches', 'branches.manage', 'Branches', 'Can manage branches'),
    ('Manage Departments', 'departments.manage', 'Departments', 'Can manage departments'),
    ('Manage Users', 'users.manage', 'Users', 'Can manage users'),
    ('Monitor Performance', 'performance.monitor', 'Performance', 'Can monitor team performance'),
    ('Field Check-in', 'field.checkin', 'Field Activity', 'Can perform GPS check-in'),
    ('Upload Field Photos', 'field.upload_photo', 'Field Activity', 'Can upload field activity photos')
ON CONFLICT (permission_code) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    module_name = EXCLUDED.module_name,
    description = EXCLUDED.description;

INSERT INTO roles (role_name, role_code, description, status)
VALUES
    ('Admin', 'admin', 'Full CRM access', 'ACTIVE'),
    ('Manager', 'manager', 'Manager monitoring access', 'ACTIVE'),
    ('Team Leader', 'team_leader', 'Team-level monitoring access', 'ACTIVE'),
    ('Sales Executive', 'sales', 'Sales user access', 'ACTIVE'),
    ('Telecaller', 'telecaller', 'Calling and follow-up access', 'ACTIVE'),
    ('Marketing', 'marketing', 'Marketing user access', 'ACTIVE'),
    ('Field Executive', 'field', 'Field activity access', 'ACTIVE'),
    ('Finance', 'finance', 'Finance user access', 'ACTIVE'),
    ('Service', 'service', 'Service user access', 'ACTIVE')
ON CONFLICT (role_code) DO UPDATE SET
    role_name = EXCLUDED.role_name,
    description = EXCLUDED.description,
    status = EXCLUDED.status;

-- =====================================================
-- User Management Safe Upgrade: Branch / Department / Role / Scope / Flags
-- Safe to run multiple times.
-- =====================================================
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
ADD COLUMN IF NOT EXISTS user_code TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS department_id BIGINT,
ADD COLUMN IF NOT EXISTS branch_id BIGINT,
ADD COLUMN IF NOT EXISTS designation TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS manager_id BIGINT,
ADD COLUMN IF NOT EXISTS data_scope TEXT DEFAULT 'OWN',
ADD COLUMN IF NOT EXISTS can_view BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS can_create BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_edit BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_assign BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_delete BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_export BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_monitor BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS permission_master (
    id BIGSERIAL PRIMARY KEY,
    permission_key TEXT UNIQUE NOT NULL,
    permission_label TEXT DEFAULT '',
    module_name TEXT DEFAULT 'General',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_permissions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL,
    allowed BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, permission_key)
);

INSERT INTO permission_master (permission_key, permission_label, module_name)
VALUES
    ('leads.view', 'View Leads', 'Leads'),
    ('leads.create', 'Create Leads', 'Leads'),
    ('leads.edit', 'Edit Leads', 'Leads'),
    ('leads.assign', 'Assign Leads', 'Leads'),
    ('leads.export', 'Export Leads', 'Leads'),
    ('followups.view', 'View Follow-ups', 'Follow-ups'),
    ('followups.create', 'Create Follow-ups', 'Follow-ups'),
    ('reports.view', 'View Reports', 'Reports'),
    ('reports.send', 'Send Reports', 'Reports'),
    ('branches.manage', 'Manage Branches', 'Branches'),
    ('departments.manage', 'Manage Departments', 'Departments'),
    ('users.manage', 'Manage Users', 'Users'),
    ('performance.monitor', 'Monitor Performance', 'Performance'),
    ('campaigns.view', 'View Campaigns', 'Marketing'),
    ('field.checkin', 'Field Check-in', 'Field'),
    ('field.upload_photo', 'Upload Field Photo', 'Field')
ON CONFLICT (permission_key) DO NOTHING;


-- Customer OTP verification foundation
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) DEFAULT 'NOT_VERIFIED',
ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS verification_remarks TEXT,
ADD COLUMN IF NOT EXISTS verification_otp VARCHAR(10),
ADD COLUMN IF NOT EXISTS verification_otp_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS verification_otp_sent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS verification_otp_attempts INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_verification_status
ON leads(verification_status);
