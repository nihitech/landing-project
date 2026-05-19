-- NIKRION Branch-wise Lead Assignment Engine support indexes

CREATE INDEX IF NOT EXISTS idx_users_branch_role_status
ON users(branch_id, role, status);

CREATE INDEX IF NOT EXISTS idx_users_vehicle_category_scope
ON users(vehicle_category_scope);

CREATE INDEX IF NOT EXISTS idx_leads_branch_assigned_status
ON leads(branch_id, assigned_to, status);
