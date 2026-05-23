-- Department Role Workspace v1 Permission Seeds

INSERT INTO permission_master(permission_key, permission_label, module_name)
VALUES
('workspace.sales', 'Sales Workspace Access', 'Workspace'),
('workspace.manager', 'Sales Manager Workspace Access', 'Workspace'),
('workspace.receptionist', 'Receptionist Workspace Access', 'Workspace'),
('workspace.digital_marketing', 'Digital Marketing Workspace Access', 'Workspace'),
('workspace.telecaller', 'Telecaller Workspace Access', 'Workspace'),
('leads.reassign', 'Reassign Leads', 'Leads'),
('leads.telecalling_update', 'Telecalling Lead Update', 'Leads'),
('leads.digital_modify', 'Digital Marketing Lead Modify', 'Leads'),
('call_recording.view', 'View Call Recordings', 'Call Recording'),
('call_recording.upload', 'Upload Call Recording', 'Call Recording')
ON CONFLICT(permission_key) DO NOTHING;
