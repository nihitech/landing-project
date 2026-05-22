CREATE TABLE IF NOT EXISTS customer_timeline_notes (
id SERIAL PRIMARY KEY, lead_id INTEGER REFERENCES leads(id), note_type VARCHAR(80) DEFAULT 'MANUAL',
title VARCHAR(250), note TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_timeline_notes_lead ON customer_timeline_notes(lead_id);
