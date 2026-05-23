# Role Alias & Permission Consistency v1

Why:
- Receptionist got 403 because role names were inconsistent between frontend/users/backend.
- This centralizes role alias handling to avoid future role mismatch bugs.

Added:
- backend/services/roleAccess.js
- Frontend normalizeUserRole helper
- Permission seed SQL

Patched:
- showroomQr.js
- quickEnquiries.js
- processActions.js
- crm-common.js

Normalized aliases:
- reception/front_office/frontdesk/CRE → receptionist
- sales_executive/sales_consultant/salesperson → sales
- sales_manager → manager
- BM → branch_manager
- crm_executive/tele_caller → telecaller
