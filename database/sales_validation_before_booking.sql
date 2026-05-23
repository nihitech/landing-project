ALTER TABLE leads
ADD COLUMN IF NOT EXISTS customer_validation_status VARCHAR(50) DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS detailed_enquiry_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS detailed_enquiry_completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS validated_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS validation_remarks TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_validation_status ON leads(customer_validation_status);
CREATE INDEX IF NOT EXISTS idx_leads_detailed_completed ON leads(detailed_enquiry_completed);
