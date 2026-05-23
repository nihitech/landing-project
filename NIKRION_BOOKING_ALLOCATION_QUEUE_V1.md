# Booking Allocation Queue v1

Implemented:
- Pending booking allocation API
- Matching available inventory API
- Allocate VIN/vehicle to booking API
- Frontend booking-allocation.html queue
- Updates booking_status = VEHICLE_ALLOCATED
- Updates vehicle_inventory_units.vehicle_status = ALLOCATED_TO_CUSTOMER
- Updates leads.vehicle_allocation_status = ALLOCATED
- Keeps sales booking request and booking team allocation separated.
