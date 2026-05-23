-- NIKRION Process Action Engine v1

CREATE TABLE IF NOT EXISTS process_queries (
    id SERIAL PRIMARY KEY,
    query_type VARCHAR(80) DEFAULT 'GENERAL',
    title VARCHAR(250),
    message TEXT,
    lead_id INTEGER REFERENCES leads(id),
    raised_by INTEGER REFERENCES users(id),
    assigned_to INTEGER REFERENCES users(id),
    answered_by INTEGER REFERENCES users(id),
    query_status VARCHAR(40) DEFAULT 'OPEN',
    answer TEXT,
    priority VARCHAR(30) DEFAULT 'NORMAL',
    created_at TIMESTAMP DEFAULT NOW(),
    answered_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS process_action_logs (
    id SERIAL PRIMARY KEY,
    action_key VARCHAR(100),
    entity_type VARCHAR(80),
    entity_id INTEGER,
    lead_id INTEGER REFERENCES leads(id),
    performed_by INTEGER REFERENCES users(id),
    old_status VARCHAR(80),
    new_status VARCHAR(80),
    remarks TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_process_queries_lead ON process_queries(lead_id);
CREATE INDEX IF NOT EXISTS idx_process_queries_status ON process_queries(query_status);
CREATE INDEX IF NOT EXISTS idx_process_action_logs_lead ON process_action_logs(lead_id);
