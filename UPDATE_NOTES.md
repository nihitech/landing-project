# CRM Stability Patch Applied

Updated by ChatGPT on 2026-05-11.

## Fixed / Added

1. Backend `backend/routes/leads.js`
   - Duplicate lead control by phone number.
   - Activity logging helper.
   - Activity history endpoint: `GET /api/lead/:id/activity`.
   - Lost reason and competitor model saving when status is `LOST`.
   - Activity logs for lead create, duplicate lead, follow-up, status update, assignment, notes update, enquiry update, and auto escalation.
   - Extra analytics fields for missed follow-ups and booked month.

2. Frontend `frontend/js/leads.js`
   - LOST status prompt now has clear spacing and examples.
   - Lead detail modal now shows Lost Reason and Competitor with proper spacing.
   - Activity History now loads inside lead detail modal.

3. Frontend `frontend/js/admin.js`, `frontend/js/user-dashboard.js`, `frontend/js/admin-legacy.js`
   - LOST status prompts now include spacing and examples.

4. CSS `frontend/css/styles.css`
   - Added/confirmed spacing styles for lost reason rows.
   - Added/confirmed activity history UI styles.

5. Database `database/schema.sql`
   - Added `preferred_color` column.
   - Added `competitor_model` column.
   - Added `activity_logs` table and indexes.
   - Added safe `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` upgrade lines.

6. Other fixes
   - Fixed `frontend/settings.html` script order so `API` is available before display.
   - Added missing `frontend/assets/images/xuv400.jpg` placeholder copy to avoid broken image.

## Required after deployment

Run `database/schema.sql` or at least these SQL commands in your live PostgreSQL/Supabase database:

```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS preferred_color TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS competitor_model TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT REFERENCES leads(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    old_value TEXT DEFAULT '',
    new_value TEXT DEFAULT '',
    remarks TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_lead_id ON activity_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
```

## Verification performed

- `node --check` passed for backend routes, backend services, middleware, config, server, and frontend JS files.
- Backend `/health` and `/` routes started successfully in sandbox.
- DB connection could not be fully tested in sandbox due external DNS/network access limitation.


## 2026-05-15 Safe data-load fix
- Restored shared frontend globals in `frontend/js/crm-common.js`: `API`, `token`, `user`, `authHeaders`, `request`, `safe`, `toast`, `fmtDate`, follow-up helpers, notification helpers.
- Kept the nested professional sidebar, but fixed menu links to real files such as `permissions.html`.
- Fixed dashboard follow-up reading to support existing `next_followup_at` as well as newer aliases.
- Added compact dashboard follow-up card CSS.
- Backend routes and database logic were not destructively changed.
