-- Role Performance Scorecard v1
-- Uses existing tables: leads, call_logs, process_queries, bookings.
-- No destructive DB changes.
INSERT INTO permission_master(permission_key, permission_label, module_name)
VALUES ('performance.view', 'View Performance Scorecard', 'Performance')
ON CONFLICT(permission_key) DO NOTHING;
