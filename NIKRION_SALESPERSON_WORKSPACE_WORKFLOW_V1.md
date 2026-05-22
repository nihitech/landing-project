# Salesperson Workspace Workflow v1

Implemented carefully for sales role only.

Workflow:
1. Salesperson login redirects to Sales Workspace through role workspace router.
2. Sales Workspace has + New Enquiry button.
3. New enquiry modal captures mandatory customer details:
   - customer name
   - phone
   - vehicle category
   - model
   - optional variant, fuel, color, area, district, notes
4. Submit creates Quick Enquiry under leads flow using /api/quick-enquiries.
5. Salesperson can send OTP and verify from the same flow.
6. Vehicle status view is read-only using Vehicle Intelligence endpoints.
7. Dashboard shows:
   - My Leads
   - Today's Follow-ups
   - Missed Follow-ups
   - Unread Alerts
   - Task queue
   - Timeline shortcuts
   - Lead open shortcuts
   - Call shortcut
   - Vehicle Status shortcut

Not changed:
- Manager/team leader/telecalling flows are untouched.
- Booking/VIN allocation remains controlled by existing booking/inventory workflows.
- Sales users do not get vehicle master modification.


Enhancement added:
- Today's Follow-up Leads section
- Reminder & Escalation section
- Lead Status Board
- Dashboard-level Customer Vehicle Option Check
- Notifications section
- Quick Actions preserved
- Recent Lead Task Queue preserved
