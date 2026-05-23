# Booking Request Connection

Fixed major partial gap:
- Sales booking request now creates a real booking record in bookings table.
- Booking can be created without VIN/inventory initially.
- Lead status becomes BOOKED.
- Lead booking_request_status becomes REQUESTED.
- Lead vehicle_allocation_status becomes PENDING_ALLOCATION unless already allocated.
- If existing booking exists, request is refreshed instead of duplicate created.
- bookings.js create route finalRetailStatus undefined bug fixed.

Next future enhancement:
- Manager/booking team allocation dashboard should allocate VIN to pending booking.
