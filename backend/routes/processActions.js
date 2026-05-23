const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");

let logger = null;
try { logger = require("../utils/activityLogger"); } catch (err) {}

function clean(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function parseId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

function roleOf(user) {
    return clean(user?.role).toLowerCase();
}

function isManagerUser(user) {
    return ["manager", "sales_manager", "team_leader", "branch_manager", "bm", "dgm", "gm", "md", "ceo", "admin", "super_admin"].includes(roleOf(user));
}

async function audit(payload) {
    try {
        if (logger?.logActivity) await logger.logActivity(payload);
    } catch (err) {}
}

async function ensureSchema() {
    await db.query(`
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
        )
    `);

    await db.query(`
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
        )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_process_queries_lead ON process_queries(lead_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_process_queries_status ON process_queries(query_status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_process_action_logs_lead ON process_action_logs(lead_id)`);
}

async function logProcessAction(payload) {
    await ensureSchema();

    const result = await db.query(`
        INSERT INTO process_action_logs
        (action_key, entity_type, entity_id, lead_id, performed_by, old_status, new_status, remarks, metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
    `, [
        clean(payload.action_key),
        clean(payload.entity_type || "LEAD"),
        payload.entity_id || null,
        payload.lead_id || null,
        payload.performed_by || null,
        clean(payload.old_status),
        clean(payload.new_status),
        clean(payload.remarks),
        JSON.stringify(payload.metadata || {})
    ]);

    return result.rows[0];
}

router.get("/queries", auth, async (req, res) => {
    try {
        await ensureSchema();

        const values = [];
        const clauses = ["1=1"];

        if (!isManagerUser(req.user)) {
            values.push(req.user.id);
            clauses.push(`q.raised_by = $${values.length}`);
        }

        if (req.query.status) {
            values.push(clean(req.query.status).toUpperCase());
            clauses.push(`q.query_status = $${values.length}`);
        }

        const result = await db.query(`
            SELECT
                q.*,
                rb.name AS raised_by_name,
                ab.name AS answered_by_name,
                au.name AS assigned_to_name,
                l.name AS lead_name,
                l.phone AS lead_phone
            FROM process_queries q
            LEFT JOIN users rb ON rb.id = q.raised_by
            LEFT JOIN users ab ON ab.id = q.answered_by
            LEFT JOIN users au ON au.id = q.assigned_to
            LEFT JOIN leads l ON l.id = q.lead_id
            WHERE ${clauses.join(" AND ")}
            ORDER BY q.created_at DESC
            LIMIT 300
        `, values);

        res.json(result.rows);
    } catch (err) {
        console.error("PROCESS QUERY LIST ERROR:", err);
        res.status(500).json({ message: "Failed to load process queries" });
    }
});

router.post("/queries", auth, async (req, res) => {
    try {
        await ensureSchema();

        const title = clean(req.body.title);
        const message = clean(req.body.message);
        if (!title || !message) {
            return res.status(400).json({ message: "Title and message are required" });
        }

        let assignedTo = parseId(req.body.assigned_to);
        if (Number.isNaN(assignedTo)) return res.status(400).json({ message: "Invalid assigned user" });

        if (!assignedTo && req.user?.manager_id) assignedTo = req.user.manager_id;

        const result = await db.query(`
            INSERT INTO process_queries
            (query_type, title, message, lead_id, raised_by, assigned_to, priority)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING *
        `, [
            clean(req.body.query_type || "GENERAL").toUpperCase(),
            title,
            message,
            parseId(req.body.lead_id),
            req.user.id,
            assignedTo || null,
            clean(req.body.priority || "NORMAL").toUpperCase()
        ]);

        await audit({
            req,
            user_id: req.user.id,
            lead_id: parseId(req.body.lead_id),
            action: "PROCESS_QUERY_RAISED",
            module_name: "PROCESS_ACTION",
            entity_type: "PROCESS_QUERY",
            entity_id: result.rows[0].id,
            new_value: "OPEN",
            remarks: title
        });

        res.status(201).json({ message: "Query raised successfully", query: result.rows[0] });
    } catch (err) {
        console.error("PROCESS QUERY CREATE ERROR:", err);
        res.status(500).json({ message: "Failed to raise query" });
    }
});

router.post("/queries/:id/answer", auth, async (req, res) => {
    try {
        await ensureSchema();

        if (!isManagerUser(req.user)) {
            return res.status(403).json({ message: "Only manager/higher authority can answer queries" });
        }

        const id = parseId(req.params.id);
        if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid query id" });

        const answer = clean(req.body.answer);
        if (!answer) return res.status(400).json({ message: "Answer is required" });

        const result = await db.query(`
            UPDATE process_queries
            SET answer=$1,
                answered_by=$2,
                query_status='ANSWERED',
                answered_at=NOW(),
                updated_at=NOW()
            WHERE id=$3
            RETURNING *
        `, [answer, req.user.id, id]);

        if (!result.rows.length) return res.status(404).json({ message: "Query not found" });

        await audit({
            req,
            user_id: req.user.id,
            lead_id: result.rows[0].lead_id,
            action: "PROCESS_QUERY_ANSWERED",
            module_name: "PROCESS_ACTION",
            entity_type: "PROCESS_QUERY",
            entity_id: id,
            new_value: "ANSWERED",
            remarks: answer
        });

        res.json({ message: "Query answered", query: result.rows[0] });
    } catch (err) {
        console.error("PROCESS QUERY ANSWER ERROR:", err);
        res.status(500).json({ message: "Failed to answer query" });
    }
});

router.post("/lead/:id/status", auth, async (req, res) => {
    try {
        await ensureSchema();

        const id = parseId(req.params.id);
        if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid lead id" });

        const newStatus = clean(req.body.status).toUpperCase();
        const allowed = ["CONTACTED", "FOLLOW-UP", "TEST-DRIVE", "BOOKED", "CLOSED", "LOST"];
        if (!allowed.includes(newStatus)) {
            return res.status(400).json({ message: "Invalid next status" });
        }

        const old = await db.query(`SELECT id,status,assigned_to FROM leads WHERE id=$1 LIMIT 1`, [id]);
        if (!old.rows.length) return res.status(404).json({ message: "Lead not found" });

        const oldLead = old.rows[0];

        if (!isManagerUser(req.user) && oldLead.assigned_to && Number(oldLead.assigned_to) !== Number(req.user.id)) {
            return res.status(403).json({ message: "You can update only your assigned leads" });
        }

        const result = await db.query(`
            UPDATE leads
            SET status=$1, updated_at=NOW()
            WHERE id=$2
            RETURNING *
        `, [newStatus, id]);

        await logProcessAction({
            action_key: "LEAD_STATUS_MOVE",
            lead_id: id,
            entity_id: id,
            performed_by: req.user.id,
            old_status: oldLead.status,
            new_status: newStatus,
            remarks: clean(req.body.remarks),
            metadata: { source: "PROCESS_ACTION_ENGINE" }
        });

        res.json({ message: "Lead moved forward", lead: result.rows[0] });
    } catch (err) {
        console.error("LEAD STATUS PROCESS ERROR:", err);
        res.status(500).json({ message: "Failed to move lead status" });
    }
});

router.post("/lead/:id/followup", auth, async (req, res) => {
    try {
        await ensureSchema();

        const id = parseId(req.params.id);
        if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid lead id" });

        const remarks = clean(req.body.remarks);
        const nextDate = clean(req.body.next_followup_at || req.body.next_followup_date);
        const callStatus = clean(req.body.call_status || "FOLLOW_UP").toUpperCase();
        const response = clean(req.body.customer_response || req.body.response);

        await db.query(`
            INSERT INTO lead_followups
            (lead_id, user_id, followup_type, call_status, customer_response, remarks, next_followup_at)
            VALUES ($1,$2,'SALES_FOLLOWUP',$3,$4,$5,$6)
        `, [
            id,
            req.user.id,
            callStatus,
            response,
            remarks,
            nextDate || null
        ]);

        await db.query(`
            UPDATE leads
            SET status='FOLLOW-UP',
                next_followup_at=$1,
                updated_at=NOW()
            WHERE id=$2
        `, [nextDate || null, id]);

        await logProcessAction({
            action_key: "SALES_FOLLOWUP_UPDATE",
            lead_id: id,
            entity_id: id,
            performed_by: req.user.id,
            old_status: "",
            new_status: "FOLLOW-UP",
            remarks,
            metadata: { call_status: callStatus, customer_response: response, next_followup_at: nextDate }
        });

        res.json({ message: "Follow-up updated" });
    } catch (err) {
        console.error("FOLLOWUP PROCESS ERROR:", err);
        res.status(500).json({ message: "Failed to update follow-up" });
    }
});

router.post("/lead/:id/request-booking", auth, async (req, res) => {
    try {
        await ensureSchema();

        const id = parseId(req.params.id);
        if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid lead id" });

        const old = await db.query(`SELECT * FROM leads WHERE id=$1 LIMIT 1`, [id]);
        if (!old.rows.length) return res.status(404).json({ message: "Lead not found" });

        await db.query(`UPDATE leads SET status='BOOKED', updated_at=NOW() WHERE id=$1`, [id]);

        await logProcessAction({
            action_key: "BOOKING_REQUESTED",
            lead_id: id,
            entity_id: id,
            performed_by: req.user.id,
            old_status: old.rows[0].status,
            new_status: "BOOKED",
            remarks: clean(req.body.remarks || "Booking requested by sales user"),
            metadata: { booking_request: true }
        });

        res.json({ message: "Booking request created. Vehicle allotment remains controlled by booking/inventory workflow." });
    } catch (err) {
        console.error("BOOKING REQUEST PROCESS ERROR:", err);
        res.status(500).json({ message: "Failed to request booking" });
    }
});

router.get("/logs", auth, async (req, res) => {
    try {
        await ensureSchema();

        const values = [];
        const clauses = ["1=1"];

        if (req.query.lead_id) {
            values.push(parseId(req.query.lead_id));
            clauses.push(`pal.lead_id=$${values.length}`);
        }

        const result = await db.query(`
            SELECT pal.*, u.name AS performed_by_name, l.name AS lead_name
            FROM process_action_logs pal
            LEFT JOIN users u ON u.id=pal.performed_by
            LEFT JOIN leads l ON l.id=pal.lead_id
            WHERE ${clauses.join(" AND ")}
            ORDER BY pal.created_at DESC
            LIMIT 300
        `, values);

        res.json(result.rows);
    } catch (err) {
        console.error("PROCESS LOG LIST ERROR:", err);
        res.status(500).json({ message: "Failed to load process action logs" });
    }
});

module.exports = router;
