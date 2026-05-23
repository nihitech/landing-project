-- Receptionist Showroom QR Permission Fix
-- Allows receptionist/front-office roles to review showroom QR submissions.

INSERT INTO permission_master(permission_key, permission_label, module_name)
VALUES
('showroom_qr.manage', 'Manage Showroom QR Sessions', 'Showroom QR'),
('showroom_qr.review', 'Review Showroom QR Enquiries', 'Showroom QR')
ON CONFLICT(permission_key) DO NOTHING;
