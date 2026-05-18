-- NIKRION Workflow Protection Rules
-- Prevent same active vehicle booking from being accidentally duplicated.
-- Run this safely after bookings table exists.

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_booking_inventory
ON bookings(inventory_id)
WHERE inventory_id IS NOT NULL
AND booking_status <> 'CANCELLED';

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_booking_lead
ON bookings(lead_id)
WHERE lead_id IS NOT NULL
AND booking_status <> 'CANCELLED';
