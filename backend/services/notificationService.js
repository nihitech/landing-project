/*
  NIKRION Notification & Escalation Engine
  Creates operational alerts for users, managers and leadership.
*/

function clean(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function normalizeType(value) {
    const t = clean(value || "INFO").toUpperCase();
    return ["INFO", "TASK", "WARNING", "ESCALATION", "APPROVAL", "COMMUNICATION"].includes(t) ? t : "INFO";
}

function normalizePriority(value) {
    const p = clean(value || "NORMAL").toUpperCase();
    return ["LOW", "NORMAL", "HIGH", "CRITICAL"].includes(p) ? p : "NORMAL";
}

async function ensureSchema(db) {
    await db.query(`
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
        )
    `);

    await db.query(`
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
        )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_notifications_assigned_to ON notifications(assigned_to)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_notifications_lead ON notifications(lead_id)`);
}

async function createNotification(db, payload = {}) {
    await ensureSchema(db);

    const result = await db.query(`
        INSERT INTO notifications
        (
            notification_type, priority, title, message, entity_type, entity_id,
            lead_id, assigned_to, created_by, branch_id, action_url, metadata, due_at
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
    `, [
        normalizeType(payload.notification_type),
        normalizePriority(payload.priority),
        clean(payload.title),
        clean(payload.message),
        clean(payload.entity_type),
        payload.entity_id || null,
        payload.lead_id || null,
        payload.assigned_to || null,
        payload.created_by || null,
        payload.branch_id || null,
        clean(payload.action_url),
        JSON.stringify(payload.metadata || {}),
        payload.due_at || null
    ]);

    return result.rows[0];
}

async function notifyLeadAssignee(db, lead, title, message, priority = "NORMAL") {
    if (!lead?.assigned_to) return null;

    return createNotification(db, {
        notification_type: "TASK",
        priority,
        title,
        message,
        entity_type: "LEAD",
        entity_id: lead.id,
        lead_id: lead.id,
        assigned_to: lead.assigned_to,
        branch_id: lead.branch_id || lead.assigned_branch_id || null,
        action_url: `/leads.html?lead=${lead.id}`
    });
}

async function createMissedFollowupAlerts(db) {
    await ensureSchema(db);

    const leads = await db.query(`
        SELECT id, name, phone, status, assigned_to, branch_id, assigned_branch_id, next_followup_at, next_followup_date
        FROM leads
        WHERE COALESCE(is_deleted,false)=false
        AND assigned_to IS NOT NULL
        AND COALESCE(status,'NEW') NOT IN ('CLOSED','LOST')
        AND COALESCE(next_followup_at, next_followup_date) < NOW()
        LIMIT 100
    `);

    let created = 0;

    for (const lead of leads.rows) {
        const exists = await db.query(`
            SELECT id
            FROM notifications
            WHERE notification_type='ESCALATION'
            AND entity_type='LEAD'
            AND entity_id=$1
            AND is_read=false
            AND created_at > NOW() - INTERVAL '24 hours'
            LIMIT 1
        `, [lead.id]);

        if (exists.rows.length) continue;

        await createNotification(db, {
            notification_type: "ESCALATION",
            priority: "HIGH",
            title: "Missed follow-up",
            message: `${lead.name || "Customer"} follow-up is overdue.`,
            entity_type: "LEAD",
            entity_id: lead.id,
            lead_id: lead.id,
            assigned_to: lead.assigned_to,
            branch_id: lead.branch_id || lead.assigned_branch_id || null,
            action_url: `/leads.html?lead=${lead.id}`,
            metadata: { phone: lead.phone, status: lead.status }
        });

        created++;
    }

    return created;
}

async function createPendingApprovalAlerts(db) {
    await ensureSchema(db);

    let created = 0;

    const tables = [
        { table: "data_change_requests", type: "DATA_CHANGE", url: "/data-change-approvals.html" },
        { table: "governance_approval_requests", type: "GOVERNANCE", url: "/governance-matrix.html" }
    ];

    for (const item of tables) {
        try {
            const pending = await db.query(`
                SELECT COUNT(*)::int AS count
                FROM ${item.table}
                WHERE request_status='PENDING'
            `);

            const count = pending.rows[0]?.count || 0;
            if (count <= 0) continue;

            const managers = await db.query(`
                SELECT id, branch_id
                FROM users
                WHERE COALESCE(status,'ACTIVE')='ACTIVE'
                AND LOWER(COALESCE(role,'')) IN ('manager','sales_manager','branch_manager','bm','dgm','gm','md','ceo')
                LIMIT 50
            `);

            for (const manager of managers.rows) {
                const exists = await db.query(`
                    SELECT id FROM notifications
                    WHERE notification_type='APPROVAL'
                    AND entity_type=$1
                    AND assigned_to=$2
                    AND is_read=false
                    AND created_at > NOW() - INTERVAL '12 hours'
                    LIMIT 1
                `, [item.type, manager.id]);

                if (exists.rows.length) continue;

                await createNotification(db, {
                    notification_type: "APPROVAL",
                    priority: "HIGH",
                    title: "Approval requests pending",
                    message: `${count} approval request(s) require review.`,
                    entity_type: item.type,
                    assigned_to: manager.id,
                    branch_id: manager.branch_id,
                    action_url: item.url,
                    metadata: { pending_count: count }
                });

                created++;
            }
        } catch (err) {
            // Table may not exist in older deployments; ignore safely.
        }
    }

    return created;
}

module.exports = {
    ensureSchema,
    createNotification,
    notifyLeadAssignee,
    createMissedFollowupAlerts,
    createPendingApprovalAlerts
};
