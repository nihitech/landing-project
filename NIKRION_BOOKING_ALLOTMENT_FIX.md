# Booking Allotment Fix

Exact issues found:
1. Frontend booking-allocation.js was calling:
   - GET /api/bookings/pending-allocation
   - GET /api/bookings/:id/available-inventory
   - POST /api/bookings/:id/allocate-inventory
   But backend bookings.js did not contain these endpoints in the latest version.

2. bookings.js used assertNoActiveBookingConflict(), but that helper function was missing.
   This would crash booking create/update at runtime.

3. vehicle_inventory_units.booking_id was updated with bookingNo string in booking create route.
   It should store the booking table id, not booking number.

Fix applied:
- Restored booking allocation queue APIs.
- Added assertNoActiveBookingConflict helper.
- Corrected vehicle_inventory_units.booking_id assignment to booking id.
