CREATE TABLE IF NOT EXISTS communication_templates (
id SERIAL PRIMARY KEY, template_key VARCHAR(100) UNIQUE NOT NULL, channel VARCHAR(40) DEFAULT 'WHATSAPP',
template_name VARCHAR(200), subject VARCHAR(250), body TEXT NOT NULL, trigger_event VARCHAR(100),
is_auto_reply BOOLEAN DEFAULT false, is_active BOOLEAN DEFAULT true, created_by INTEGER REFERENCES users(id),
created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS communication_logs (
id SERIAL PRIMARY KEY, lead_id INTEGER REFERENCES leads(id), customer_name VARCHAR(200), phone VARCHAR(30), email VARCHAR(200),
channel VARCHAR(40), direction VARCHAR(40), template_key VARCHAR(100), subject VARCHAR(250), message_body TEXT,
provider_name VARCHAR(100), provider_message_id VARCHAR(200), status VARCHAR(40) DEFAULT 'QUEUED',
sent_by INTEGER REFERENCES users(id), metadata JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMP DEFAULT NOW(),
sent_at TIMESTAMP, delivered_at TIMESTAMP, read_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_communication_logs_lead ON communication_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_communication_logs_channel ON communication_logs(channel);
INSERT INTO communication_templates(template_key,channel,template_name,subject,body,trigger_event,is_auto_reply)
VALUES
('LEAD_WELCOME_WHATSAPP','WHATSAPP','Lead Welcome WhatsApp','','Hi {{name}}, thank you for your enquiry. Our team will contact you shortly.','LEAD_CREATED',true),
('FOLLOWUP_REMINDER_WHATSAPP','WHATSAPP','Follow-up Reminder WhatsApp','','Hi {{name}}, this is a reminder regarding your enquiry for {{car_interest}}.','FOLLOWUP_DUE',false)
ON CONFLICT(template_key) DO NOTHING;
