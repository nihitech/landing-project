# Leads Data Action Governance UI

Connected:
- Leads page loads data action rights.
- Authorized users see direct edit button.
- Unauthorized users see Request Edit.
- Authorized delete is reserved, but direct delete endpoint remains disabled for safety.
- Unauthorized users see Request Delete.
- Requests go to /api/data-change-requests and are visible in Data Change Approvals.

Basic progress still works through:
- status dropdown
- follow-up button
- notes/follow-up flows
