-- NIKRION Governance Enforcement Layer v1
-- Applies matrix to real operations.

-- No destructive changes. This file documents enforcement and adds optional helper permissions.
INSERT INTO permission_master (permission_key, permission_label, module_name)
VALUES
    ('vehicle.dashboard.view', 'View Vehicle Dashboard', 'Governance Enforcement'),
    ('vehicle.status.view', 'View Vehicle Status Only', 'Governance Enforcement'),
    ('vehicle.modify', 'Modify Vehicle Master', 'Governance Enforcement'),
    ('organization.modify', 'Modify Branch/Department/Organization', 'Governance Enforcement'),
    ('reports.generate', 'Generate Reports', 'Governance Enforcement'),
    ('lead.edit.direct', 'Direct Critical Lead Edit', 'Governance Enforcement')
ON CONFLICT (permission_key) DO NOTHING;
