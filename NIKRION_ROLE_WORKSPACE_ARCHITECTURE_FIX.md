# NIKRION Role Workspace Architecture Fix

Workspace is now primary operational layer, not a reports sub-menu item.

Rules:
- Dashboard redirects non-admin users to their role workspace.
- Admin/system users remain in Control Center.
- Workspaces have their own sidebar group.
- Sales Workspace v2 uses real APIs: /api/leads and /api/notifications?mine=true.
