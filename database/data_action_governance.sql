-- NIKRION Data Action Governance
CREATE TABLE IF NOT EXISTS data_change_requests (
 id SERIAL PRIMARY KEY,
 entity_type VARCHAR(80) NOT NULL,
 entity_id INTEGER,
 action_type VARCHAR(40) NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_data_change_requests_status ON data_change_requests(request_status);
CREATE INDEX IF NOT EXISTS idx_data_change_requests_entity ON data_change_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_data_change_requests_requested_by ON data_change_requests(requested_by);
INSERT INTO permission_master(permission_key,permission_label,module_name) VALUES
('data.confidential.modify','Modify Confidential Data','Data Governance'),
('data.confidential.delete','Delete Confidential Data','Data Governance'),
('data_change.approve','Approve Data Change Requests','Data Governance'),
('customer.progress.update','Update Customer Progress','Data Governance')
ON CONFLICT(permission_key) DO NOTHING;

-- Approval Application Engine additions
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS delete_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_is_deleted ON leads(is_deleted);
