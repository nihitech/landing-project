# Receptionist QR Permission Fix

Issue:
- Receptionist dashboard called /api/showroom-qr/submissions.
- Backend returned 403: No permission to review showroom enquiries.

Fix:
- Added receptionist role aliases:
  - receptionist
  - reception
  - front_office
  - frontoffice
  - front-desk
  - front_desk
  - CRE / customer_relation_executive
- Permission keys are seeded:
  - showroom_qr.manage
  - showroom_qr.review

Rytr 401 is browser extension issue and not CRM issue.
