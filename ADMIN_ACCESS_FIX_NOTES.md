# Admin Access Fix

Updated admin/super-access handling for current Admin and future higher authority roles.

## Higher authority roles
- admin
- super_admin
- owner
- director
- ceo

## Fixed areas
- Backend route admin checks now accept higher-authority roles.
- Admin bypass preserved for permission checks.
- Auth middleware normalizes role and carries vehicle_category_scope.
- Frontend admin page checks and admin-only visibility updated.
- NIKRION branding updated in common sidebar.
- Added default permission keys for performance and permissions management.

## Checked
- Backend JS syntax passed with `node --check`.
- Frontend JS syntax passed with `node --check`.
