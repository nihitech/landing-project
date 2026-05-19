-- NIKRION Field Activity & GPS Validation Engine

CREATE TABLE IF NOT EXISTS field_activities (
    id SERIAL PRIMARY KEY,
    activity_name VARCHAR(200) NOT NULL,
    activity_type VARCHAR(80) DEFAULT 'FIELD_VISIT',
    source_type VARCHAR(80),
    description TEXT,
    branch_id INTEGER REFERENCES branches(id),
    location_name VARCHAR(200),
    address TEXT,
    target_latitude NUMERIC(12,8),
    target_longitude NUMERIC(12,8),
    allowed_radius_meters INTEGER DEFAULT 800,
    warning_radius_meters INTEGER DEFAULT 1500,
    location_mode VARCHAR(40) DEFAULT 'FIXED',
    strict_validation BOOLEAN DEFAULT false,
    activity_date DATE,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    expected_duration_minutes INTEGER DEFAULT 0,
    expected_leads_count INTEGER DEFAULT 0,
    status VARCHAR(40) DEFAULT 'PLANNED',
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS field_activity_assignments (
    id SERIAL PRIMARY KEY,
    activity_id INTEGER REFERENCES field_activities(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    assigned_by INTEGER REFERENCES users(id),
    assignment_status VARCHAR(40) DEFAULT 'ASSIGNED',
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(activity_id, user_id)
);

CREATE TABLE IF NOT EXISTS field_activity_attendance (
    id SERIAL PRIMARY KEY,
    activity_id INTEGER REFERENCES field_activities(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    check_type VARCHAR(30) DEFAULT 'CHECK_IN',
    latitude NUMERIC(12,8),
    longitude NUMERIC(12,8),
    distance_meters INTEGER,
    validation_status VARCHAR(40),
    device_info TEXT,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS field_activity_id INTEGER REFERENCES field_activities(id),
ADD COLUMN IF NOT EXISTS field_activity_source VARCHAR(100),
ADD COLUMN IF NOT EXISTS lead_capture_latitude NUMERIC(12,8),
ADD COLUMN IF NOT EXISTS lead_capture_longitude NUMERIC(12,8);

CREATE INDEX IF NOT EXISTS idx_field_activities_branch ON field_activities(branch_id);
CREATE INDEX IF NOT EXISTS idx_field_activities_status ON field_activities(status);
CREATE INDEX IF NOT EXISTS idx_field_activity_assignments_user ON field_activity_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_field_activity_attendance_activity ON field_activity_attendance(activity_id);
CREATE INDEX IF NOT EXISTS idx_leads_field_activity ON leads(field_activity_id);

INSERT INTO permission_master (permission_key, permission_label, module_name)
VALUES
    ('field_activity.view', 'View Field Activities', 'Field Activity'),
    ('field_activity.manage', 'Manage Field Activities', 'Field Activity'),
    ('field_activity.checkin', 'Check-in Field Activity', 'Field Activity')
ON CONFLICT (permission_key) DO NOTHING;
