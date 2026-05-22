-- NIKRION Notification & Escalation Engine

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    notification_type VARCHAR(50) DEFAULT 'INFO',
    priority VARCHAR(30) DEFAULT 'NORMAL',
    title VARCHAR(250) NOT NULL,
    message TEXT,
    entity_type VARCHAR(80),
    entity_id INTEGER,
    lead_id INTEGER REFERENCES leads(id),
    assigned_to INTEGER REFERENCES users(id),
    created_by INTEGER REFERENCES users(id),
    branch_id INTEGER,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    action_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    due_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS escalation_rules (
    id SERIAL PRIMARY KEY,
    rule_key VARCHAR(100) UNIQUE NOT NULL,
    rule_name VARCHAR(200),
    trigger_event VARCHAR(100),
    priority VARCHAR(30) DEFAULT 'HIGH',
    target_role VARCHAR(80),
    delay_minutes INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_assigned_to ON notifications(assigned_to);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_lead ON notifications(lead_id);

INSERT INTO escalation_rules(rule_key, rule_name, trigger_event, priority, target_role, delay_minutes)
VALUES
('MISSED_FOLLOWUP_SALES', 'Missed follow-up alert to salesperson', 'FOLLOWUP_OVERDUE', 'HIGH', 'SALES', 0),
('APPROVAL_PENDING_MANAGER', 'Approval pending alert to manager', 'APPROVAL_PENDING', 'HIGH', 'MANAGER', 0)
ON CONFLICT(rule_key) DO NOTHING;
