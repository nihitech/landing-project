-- NIKRION Branch-Level Access Control v1

ALTER TABLE users
ADD COLUMN IF NOT EXISTS data_scope TEXT DEFAULT 'OWN',
ADD COLUMN IF NOT EXISTS can_view BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS can_create BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_edit BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_assign BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_delete BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_export BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_monitor BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_branch_scope ON users(branch_id, data_scope);
CREATE INDEX IF NOT EXISTS idx_leads_branch_assigned ON leads(branch_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_quick_enquiries_branch_created ON quick_enquiries(branch_id, created_by);
CREATE INDEX IF NOT EXISTS idx_showroom_qr_submissions_branch ON showroom_qr_submissions(assigned_branch_id);
CREATE INDEX IF NOT EXISTS idx_field_activities_branch ON field_activities(branch_id);

INSERT INTO permission_master (permission_key, permission_label, module_name)
VALUES
 ('users.view_branch', 'View Branch Users', 'Users'),
 ('leads.view_branch', 'View Branch Leads', 'Leads'),
 ('leads.create', 'Create Leads', 'Leads'),
 ('leads.edit_branch', 'Edit Branch Leads', 'Leads'),
 ('leads.delete_branch', 'Delete Branch Leads', 'Leads'),
 ('reports.view_branch', 'View Branch Reports', 'Reports'),
 ('dashboard.view_branch', 'View Branch Dashboard', 'Dashboard')
ON CONFLICT (permission_key) DO NOTHING;
