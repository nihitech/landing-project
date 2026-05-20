-- NIKRION Quick Enquiry Workflow Engine
CREATE TABLE IF NOT EXISTS quick_enquiries (
 id SERIAL PRIMARY KEY, quick_code VARCHAR(80) UNIQUE, customer_name VARCHAR(200), phone VARCHAR(30), alternate_phone VARCHAR(30), email VARCHAR(200),
 area VARCHAR(150), district VARCHAR(150), pincode VARCHAR(30), vehicle_category VARCHAR(20), fuel_type VARCHAR(80), car_interest VARCHAR(200), variant_interest VARCHAR(200), preferred_color VARCHAR(150),
 source_type VARCHAR(80), source_details TEXT, referral_name VARCHAR(200), referral_phone VARCHAR(30), field_activity_id INTEGER REFERENCES field_activities(id),
 capture_latitude NUMERIC(12,8), capture_longitude NUMERIC(12,8), notes TEXT, quick_status VARCHAR(50) DEFAULT 'PENDING_VALIDATION',
 branch_id INTEGER REFERENCES branches(id), created_by INTEGER REFERENCES users(id), assigned_to INTEGER REFERENCES users(id), reviewed_by INTEGER REFERENCES users(id), reviewed_at TIMESTAMP,
 otp_hash VARCHAR(100), otp_sent_at TIMESTAMP, otp_verified_at TIMESTAMP, otp_verified_by INTEGER REFERENCES users(id), otp_attempts INTEGER DEFAULT 0,
 lead_id INTEGER REFERENCES leads(id), rejection_reason TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quick_enquiry_id INTEGER REFERENCES quick_enquiries(id), ADD COLUMN IF NOT EXISTS enquiry_origin VARCHAR(80), ADD COLUMN IF NOT EXISTS field_activity_id INTEGER REFERENCES field_activities(id), ADD COLUMN IF NOT EXISTS field_activity_source VARCHAR(100), ADD COLUMN IF NOT EXISTS lead_capture_latitude NUMERIC(12,8), ADD COLUMN IF NOT EXISTS lead_capture_longitude NUMERIC(12,8);
CREATE INDEX IF NOT EXISTS idx_quick_enquiries_phone ON quick_enquiries(phone);
CREATE INDEX IF NOT EXISTS idx_quick_enquiries_status ON quick_enquiries(quick_status);
CREATE INDEX IF NOT EXISTS idx_quick_enquiries_branch ON quick_enquiries(branch_id);
INSERT INTO permission_master(permission_key,permission_label,module_name) VALUES ('quick_enquiry.create','Create Quick Enquiry','Quick Enquiry'),('quick_enquiry.review','Review Quick Enquiry','Quick Enquiry') ON CONFLICT(permission_key) DO NOTHING;
