-- Booking Request Connection Engine

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS booking_request_status VARCHAR(60) DEFAULT 'NOT_REQUESTED',
ADD COLUMN IF NOT EXISTS booking_requested_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS booking_requested_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS vehicle_allocation_status VARCHAR(60) DEFAULT 'NOT_ALLOCATED';

CREATE INDEX IF NOT EXISTS idx_leads_booking_request_status ON leads(booking_request_status);
CREATE INDEX IF NOT EXISTS idx_leads_vehicle_allocation_status ON leads(vehicle_allocation_status);
