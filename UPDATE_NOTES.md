# Multipurpose CRM Update

Updated modules:
- Admin dashboard with workload cards, source filters, expanded pipeline, follow-up workflow, CSV export, user management.
- Sales dashboard with assigned-lead-only visibility and follow-up workflow.
- Backend CRM APIs for role-based leads, assignment, analytics, follow-up history, advanced lead fields.
- Database schema for advanced lead profile, follow-up history, and communication logs.

Required before deploy:
1. Run `database/schema.sql` in Supabase SQL Editor.
2. Make sure Render environment variables are configured: DATABASE_URL, JWT_SECRET, Twilio values if using WhatsApp.
3. Deploy backend.
4. Hard refresh browser with Ctrl+F5.

Important:
- Login uses sessionStorage, so separate browser tabs can stay logged in as different users.
- Admin sees all leads and can assign leads.
- Sales users see only assigned leads.


## 2026-05-09 Production Stabilization Patch
- Fixed Reports module frontend function exposure (`generateReport`, CSV, WhatsApp copy).
- Fixed Reports API integration to always call Render backend instead of local Live Server `/api`.
- Fixed Follow-up modal on modular Follow-up Center and removed invalid early `document.write()` calls.
- Made report logging non-blocking so missing `report_logs` does not break report generation.
- Added `report_logs` table to schema.
- Re-ran JavaScript syntax checks across backend and frontend.
