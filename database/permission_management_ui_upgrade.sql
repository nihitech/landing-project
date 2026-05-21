-- NIKRION Permission Management UI Upgrade
-- Dashboard/module access control per user.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS dashboard_access JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_users_dashboard_access ON users USING GIN (dashboard_access);

UPDATE users
SET dashboard_access = '["dashboard","manager-dashboard","receptionist-dashboard","sales-dashboard","telecaller-dashboard","field-dashboard","finance-dashboard","service-dashboard","marketing-dashboard","leads","quick-enquiries","showroom-qr","activity","reports","bookings","delivery","vehicles","stock","inventory","branches","users"]'::jsonb
WHERE LOWER(COALESCE(role,'')) IN ('admin','super_admin','owner','director','ceo')
AND (dashboard_access IS NULL OR dashboard_access = '[]'::jsonb);

UPDATE users
SET dashboard_access = '["manager-dashboard","dashboard","leads","quick-enquiries","showroom-qr","activity","reports","bookings","delivery"]'::jsonb,
    data_scope = COALESCE(NULLIF(data_scope,''), 'BRANCH')
WHERE LOWER(COALESCE(role,'')) IN ('manager','branch_manager','team_leader')
AND (dashboard_access IS NULL OR dashboard_access = '[]'::jsonb);

UPDATE users
SET dashboard_access = '["sales-dashboard","leads","quick-enquiries","bookings"]'::jsonb
WHERE LOWER(COALESCE(role,'')) = 'sales'
AND (dashboard_access IS NULL OR dashboard_access = '[]'::jsonb);
