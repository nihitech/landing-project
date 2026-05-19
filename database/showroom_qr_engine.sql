-- NIKRION QR Showroom Enquiry Engine
-- Schema is also auto-ensured by backend route. Run this for production migrations.

CREATE TABLE IF NOT EXISTS showroom_qr_sessions (
 id SERIAL PRIMARY KEY,
 session_code VARCHAR(80) UNIQUE NOT NULL,
 branch_id INTEGER REFERENCES branches(id),
 session_date DATE DEFAULT CURRENT_DATE,
 session_name VARCHAR(200),
 qr_status VARCHAR(40) DEFAULT 'ACTIVE',
 expires_at TIMESTAMP,
 created_by INTEGER REFERENCES users(id),
 closed_by INTEGER REFERENCES users(id),
 closed_at TIMESTAMP,
 remarks TEXT,
 created_at TIMESTAMP DEFAULT NOW(),
 updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS showroom_qr_submissions (
 id SERIAL PRIMARY KEY,
 session_id INTEGER REFERENCES showroom_qr_sessions(id) ON DELETE SET NULL,
 session_code VARCHAR(80),
 submission_method VARCHAR(50) DEFAULT 'CUSTOMER_PHONE',
 submission_status VARCHAR(40) DEFAULT 'SUBMITTED',
 customer_name VARCHAR(200),
 phone VARCHAR(30),
 alternate_phone VARCHAR(30),
 email VARCHAR(200),
 area VARCHAR(150),
 district VARCHAR(150),
 pincode VARCHAR(30),
 vehicle_category VARCHAR(20),
 fuel_type VARCHAR(80),
 car_interest VARCHAR(200),
 variant_interest VARCHAR(200),
 preferred_color VARCHAR(150),
 source VARCHAR(80) DEFAULT 'SHOWROOM_QR',
 lead_type VARCHAR(80) DEFAULT 'SHOWROOM_QR_ENQUIRY',
 notes TEXT,
 consent_accepted BOOLEAN DEFAULT false,
 consent_text TEXT,
 consent_accepted_at TIMESTAMP,
 consent_ip VARCHAR(100),
 consent_user_agent TEXT,
 receptionist_id INTEGER REFERENCES users(id),
 reviewed_by INTEGER REFERENCES users(id),
 reviewed_at TIMESTAMP,
 assigned_to INTEGER REFERENCES users(id),
 assigned_branch_id INTEGER REFERENCES branches(id),
 lead_id INTEGER REFERENCES leads(id),
 created_at TIMESTAMP DEFAULT NOW(),
 updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS qr_session_id INTEGER REFERENCES showroom_qr_sessions(id),
ADD COLUMN IF NOT EXISTS qr_submission_id INTEGER REFERENCES showroom_qr_submissions(id),
ADD COLUMN IF NOT EXISTS enquiry_origin VARCHAR(80),
ADD COLUMN IF NOT EXISTS submission_method VARCHAR(80),
ADD COLUMN IF NOT EXISTS consent_accepted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS consent_text TEXT;

CREATE INDEX IF NOT EXISTS idx_showroom_qr_sessions_code ON showroom_qr_sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_showroom_qr_sessions_branch ON showroom_qr_sessions(branch_id);
CREATE INDEX IF NOT EXISTS idx_showroom_qr_submissions_session ON showroom_qr_submissions(session_id);
CREATE INDEX IF NOT EXISTS idx_showroom_qr_submissions_phone ON showroom_qr_submissions(phone);

INSERT INTO permission_master (permission_key, permission_label, module_name)
VALUES
 ('showroom_qr.manage', 'Manage Showroom QR Sessions', 'Showroom QR'),
 ('showroom_qr.review', 'Review Showroom QR Enquiries', 'Showroom QR')
ON CONFLICT (permission_key) DO NOTHING;
