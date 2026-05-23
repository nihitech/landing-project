-- Role Alias & Permission Consistency v1

INSERT INTO permission_master(permission_key, permission_label, module_name)
VALUES
('showroom_qr.manage', 'Manage Showroom QR Sessions', 'Showroom QR'),
('showroom_qr.review', 'Review Showroom QR Enquiries', 'Showroom QR'),
('quick_enquiry.create', 'Create Quick Enquiry', 'Quick Enquiry'),
('quick_enquiry.review', 'Review Quick Enquiry', 'Quick Enquiry'),
('process_actions.use', 'Use Process Action Engine', 'Process Actions')
ON CONFLICT(permission_key) DO NOTHING;
