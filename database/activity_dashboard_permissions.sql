
INSERT INTO permission_master (permission_key, permission_label, module_name)
VALUES ('activity.view', 'View Activity Intelligence', 'Activity Intelligence')
ON CONFLICT (permission_key) DO NOTHING;
