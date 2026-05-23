-- NIKRION Stable MVP Launch SQL Bundle
CREATE TABLE IF NOT EXISTS process_queries (
 id SERIAL PRIMARY KEY, query_type VARCHAR(80) DEFAULT 'GENERAL', title VARCHAR(250), message TEXT,
 lead_id INTEGER REFERENCES leads(id), raised_by INTEGER REFERENCES users(id), assigned_to INTEGER REFERENCES users(id),
 answered_by INTEGER REFERENCES users(id), query_status VARCHAR(40) DEFAULT 'OPEN', answer TEXT,
 priority VARCHAR(30) DEFAULT 'NORMAL', created_at TIMESTAMP DEFAULT NOW(), answered_at TIMESTAMP, updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS process_action_logs (
 id SERIAL PRIMARY KEY, action_key VARCHAR(100), entity_type VARCHAR(80), entity_id INTEGER,
 lead_id INTEGER REFERENCES leads(id), performed_by INTEGER REFERENCES users(id), old_status VARCHAR(80), new_status VARCHAR(80),
 remarks TEXT, metadata JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS customer_validation_status VARCHAR(50) DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS detailed_enquiry_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS detailed_enquiry_completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS validated_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS validation_remarks TEXT,
ADD COLUMN IF NOT EXISTS booking_request_status VARCHAR(60) DEFAULT 'NOT_REQUESTED',
ADD COLUMN IF NOT EXISTS booking_requested_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS booking_requested_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS vehicle_allocation_status VARCHAR(60) DEFAULT 'NOT_ALLOCATED';
CREATE TABLE IF NOT EXISTS call_logs (
 id SERIAL PRIMARY KEY, lead_id INTEGER REFERENCES leads(id), customer_name VARCHAR(200), customer_phone VARCHAR(30),
 call_direction VARCHAR(30) DEFAULT 'OUTBOUND', call_type VARCHAR(80) DEFAULT 'FOLLOW_UP', call_status VARCHAR(80) DEFAULT 'COMPLETED',
 call_started_at TIMESTAMP DEFAULT NOW(), call_duration_seconds INTEGER DEFAULT 0, recording_url TEXT, recording_file_name VARCHAR(250),
 summary TEXT, customer_response TEXT, next_followup_at TIMESTAMP, created_by INTEGER REFERENCES users(id), branch_id INTEGER,
 metadata JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_process_queries_lead ON process_queries(lead_id);
CREATE INDEX IF NOT EXISTS idx_process_action_logs_lead ON process_action_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_by ON call_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_booking_request_status ON leads(booking_request_status);
CREATE INDEX IF NOT EXISTS idx_leads_vehicle_allocation_status ON leads(vehicle_allocation_status);
INSERT INTO permission_master(permission_key, permission_label, module_name)
VALUES
('workspace.sales','Sales Workspace Access','Workspace'),
('workspace.manager','Sales Manager Workspace Access','Workspace'),
('workspace.receptionist','Receptionist Workspace Access','Workspace'),
('workspace.digital_marketing','Digital Marketing Workspace Access','Workspace'),
('workspace.telecaller','Telecaller Workspace Access','Workspace'),
('showroom_qr.manage','Manage Showroom QR Sessions','Showroom QR'),
('showroom_qr.review','Review Showroom QR Enquiries','Showroom QR'),
('quick_enquiry.create','Create Quick Enquiry','Quick Enquiry'),
('quick_enquiry.review','Review Quick Enquiry','Quick Enquiry'),
('process_actions.use','Use Process Action Engine','Process Actions'),
('call_recording.view','View Call Recordings','Call Recording'),
('call_recording.upload','Upload Call Recording','Call Recording'),
('performance.view','View Performance Scorecard','Performance')
ON CONFLICT(permission_key) DO NOTHING;
