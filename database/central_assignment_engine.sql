-- NIKRION Central Assignment Intelligence Engine
-- Adds optional audit columns for future assignment analytics.

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS assignment_reason TEXT,
ADD COLUMN IF NOT EXISTS assignment_confidence INTEGER,
ADD COLUMN IF NOT EXISTS assignment_engine_version TEXT DEFAULT 'central_v1';

ALTER TABLE quick_enquiries
ADD COLUMN IF NOT EXISTS assignment_reason TEXT,
ADD COLUMN IF NOT EXISTS assignment_confidence INTEGER;

ALTER TABLE showroom_qr_submissions
ADD COLUMN IF NOT EXISTS assignment_reason TEXT,
ADD COLUMN IF NOT EXISTS assignment_confidence INTEGER;

CREATE INDEX IF NOT EXISTS idx_leads_assignment_reason ON leads(assignment_reason);
CREATE INDEX IF NOT EXISTS idx_quick_enquiries_assignment_reason ON quick_enquiries(assignment_reason);
CREATE INDEX IF NOT EXISTS idx_showroom_qr_assignment_reason ON showroom_qr_submissions(assignment_reason);
