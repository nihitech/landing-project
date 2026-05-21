-- NIKRION Governance Matrix v2
-- Human-management driven authority architecture.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS authority_level VARCHAR(40),
ADD COLUMN IF NOT EXISTS region_id INTEGER,
ADD COLUMN IF NOT EXISTS reports_to INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS can_approve_lead_edit BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_direct_edit_lead BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_modify_vehicle_master BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_modify_organization BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS governance_approval_requests (
    id SERIAL PRIMARY KEY,
    request_type VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80),
    entity_id INTEGER,
    requested_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    request_status VARCHAR(40) DEFAULT 'PENDING',
    current_payload JSONB DEFAULT '{}'::jsonb,
    requested_payload JSONB DEFAULT '{}'::jsonb,
    reason TEXT,
    approver_remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    reviewed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_governance_approval_status ON governance_approval_requests(request_status);
CREATE INDEX IF NOT EXISTS idx_governance_approval_type ON governance_approval_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_governance_approval_requested_by ON governance_approval_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_users_authority_level ON users(authority_level);
CREATE INDEX IF NOT EXISTS idx_users_reports_to ON users(reports_to);

INSERT INTO permission_master (permission_key, permission_label, module_name)
VALUES
    ('vehicle.status.view', 'View Vehicle Status Only', 'Governance'),
    ('vehicle.dashboard.view', 'View Vehicle Dashboard', 'Governance'),
    ('vehicle.modify', 'Modify Vehicle Master', 'Governance'),
    ('organization.modify', 'Modify Organization / Department / Branch', 'Governance'),
    ('lead_edit.request', 'Request Lead Edit Approval', 'Governance'),
    ('lead_edit.approve', 'Approve Lead Edit Requests', 'Governance'),
    ('lead.edit.direct', 'Direct Critical Lead Edit', 'Governance'),
    ('reports.generate', 'Generate Reports', 'Governance'),
    ('reports.auto_generate', 'Auto Generate Reports', 'Governance')
ON CONFLICT (permission_key) DO NOTHING;
