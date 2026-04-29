const express = require("express");
const db = require("../config/db");
const { calculateScore, getLeadPriority } = require("../services/scoring");
const auth = require("../middleware/auth");

const router = express.Router();

const STATUSES = ["NEW", "CONTACTED", "FOLLOW-UP", "TEST-DRIVE", "BOOKED", "CLOSED", "LOST"];
const ACTIONS = ["ENQUIRY", "TEST_DRIVE", "CALL", "WHATSAPP"];

function normalizePhone(phone) {
    return String(phone || "").replace(/\D/g, "").slice(-10);
}

function requireAdmin(req, res, next) {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    next();
}

router.post("/lead", async (req, res) => {
    try {
        const data = req.body || {};
        const phone = normalizePhone(data.phone);
        const action = String(data.action_type || "ENQUIRY").toUpperCase();

        if (!data.name || !phone) return res.status(400).json({ message: "Name and valid phone are required" });

        const tracking = data.tracking || {};
        const score = calculateScore({ ...data, phone, action_type: action, tracking });
        const priority = getLeadPriority(score);
        const now = new Date();

        const result = await db.query(`
            INSERT INTO leads
            (name, phone, email, area, district, profession, car_interest, action_type, tracking, score, priority, status,
             followup_1, followup_2, followup_3, source, assigned_to)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'NEW',$12,$13,$14,$15,$16)
            RETURNING id
        `, [
            String(data.name).trim(),
            phone,
            String(data.email || "").trim(),
            String(data.area || "").trim(),
            String(data.district || "").trim(),
            String(data.profession || "").trim(),
            String(data.car_interest || "Not Selected").trim(),
            ACTIONS.includes(action) ? action : "ENQUIRY",
            JSON.stringify(tracking),
            score,
            priority,
            new Date(now.getTime() + 5 * 60 * 1000),
            new Date(now.getTime() + 24 * 60 * 60 * 1000),
            new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
            String(data.source || tracking.utm_source || "Website"),
            data.assigned_to || null
        ]);

        res.status(201).json({ message: "Lead saved", id: result.rows[0].id, score, priority });
    } catch (err) {
        console.error("SAVE LEAD ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/leads", auth, async (req, res) => {
    try {
        const clauses = [];
        const values = [];

        if (req.user.role !== "admin") {
            values.push(req.user.id);
            clauses.push(`l.assigned_to = $${values.length}`);
        }
        if (req.query.priority) {
            values.push(String(req.query.priority).toUpperCase());
            clauses.push(`l.priority = $${values.length}`);
        }
        if (req.query.status) {
            values.push(String(req.query.status).toUpperCase());
            clauses.push(`l.status = $${values.length}`);
        }
        if (req.query.search) {
            values.push(`%${String(req.query.search).toLowerCase()}%`);
            clauses.push(`(LOWER(l.name) LIKE $${values.length} OR l.phone LIKE $${values.length} OR LOWER(l.car_interest) LIKE $${values.length})`);
        }

        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const result = await db.query(`
            SELECT l.*, u.name AS assigned_name
            FROM leads l
            LEFT JOIN users u ON l.assigned_to = u.id
            ${where}
            ORDER BY l.created_at DESC, l.id DESC
        `, values);

        res.json(result.rows);
    } catch (err) {
        console.error("FETCH LEADS ERROR:", err);
        res.status(500).json({ message: "Fetch error" });
    }
});

router.put("/lead/:id/status", auth, async (req, res) => {
    try {
        const status = String(req.body.status || "").toUpperCase();
        if (!STATUSES.includes(status)) return res.status(400).json({ message: "Invalid status" });

        const values = [status, req.params.id];
        let ownerClause = "";
        if (req.user.role !== "admin") {
            values.push(req.user.id);
            ownerClause = `AND assigned_to = $3`;
        }

        const result = await db.query(`
            UPDATE leads SET status=$1, updated_at=NOW()
            WHERE id=$2 ${ownerClause}
            RETURNING id, status
        `, values);

        if (!result.rows.length) return res.status(404).json({ message: "Lead not found or not assigned to you" });
        res.json({ message: "Status updated", lead: result.rows[0] });
    } catch (err) {
        console.error("STATUS ERROR:", err);
        res.status(500).json({ message: "Status update failed" });
    }
});

router.put("/lead/:id/assign", auth, requireAdmin, async (req, res) => {
    try {
        const userId = req.body.user_id || null;
        if (userId) {
            const user = await db.query("SELECT id FROM users WHERE id=$1 AND role='sales'", [userId]);
            if (!user.rows.length) return res.status(400).json({ message: "Select a valid sales user" });
        }

        const result = await db.query(`
            UPDATE leads SET assigned_to=$1, updated_at=NOW()
            WHERE id=$2
            RETURNING id, assigned_to
        `, [userId, req.params.id]);

        if (!result.rows.length) return res.status(404).json({ message: "Lead not found" });
        res.json({ message: userId ? "Lead assigned" : "Lead unassigned", lead: result.rows[0] });
    } catch (err) {
        console.error("ASSIGN ERROR:", err);
        res.status(500).json({ message: "Assign failed" });
    }
});

router.put("/lead/:id/notes", auth, async (req, res) => {
    try {
        const values = [String(req.body.notes || ""), req.params.id];
        let ownerClause = "";
        if (req.user.role !== "admin") {
            values.push(req.user.id);
            ownerClause = `AND assigned_to = $3`;
        }

        const result = await db.query(`
            UPDATE leads SET notes=$1, updated_at=NOW()
            WHERE id=$2 ${ownerClause}
            RETURNING id
        `, values);

        if (!result.rows.length) return res.status(404).json({ message: "Lead not found or not assigned to you" });
        res.json({ message: "Notes saved" });
    } catch (err) {
        console.error("NOTES ERROR:", err);
        res.status(500).json({ message: "Notes update failed" });
    }
});

router.get("/analytics", auth, async (req, res) => {
    try {
        const values = [];
        let where = "";
        if (req.user.role !== "admin") {
            values.push(req.user.id);
            where = "WHERE assigned_to=$1";
        }

        const result = await db.query(`
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE priority='HOT')::int AS hot,
                COUNT(*) FILTER (WHERE priority='WARM')::int AS warm,
                COUNT(*) FILTER (WHERE priority='COLD')::int AS cold,
                COUNT(*) FILTER (WHERE UPPER(REPLACE(COALESCE(action_type,''), '-', '_'))='ENQUIRY')::int AS enquiry,
                COUNT(*) FILTER (WHERE UPPER(REPLACE(COALESCE(action_type,''), '-', '_')) IN ('TEST_DRIVE','TESTDRIVE'))::int AS testdrive,
                COUNT(*) FILTER (WHERE UPPER(COALESCE(action_type,''))='CALL')::int AS call,
                COUNT(*) FILTER (WHERE UPPER(COALESCE(action_type,''))='WHATSAPP')::int AS whatsapp,
                COUNT(*) FILTER (WHERE status='NEW')::int AS new,
                COUNT(*) FILTER (WHERE status='CONTACTED')::int AS contacted,
                COUNT(*) FILTER (WHERE status='FOLLOW-UP')::int AS followup,
                COUNT(*) FILTER (WHERE status='TEST-DRIVE')::int AS test_drive_stage,
                COUNT(*) FILTER (WHERE status='BOOKED')::int AS booked,
                COUNT(*) FILTER (WHERE status='CLOSED')::int AS closed,
                COUNT(*) FILTER (WHERE status='LOST')::int AS lost,
                COUNT(*) FILTER (WHERE assigned_to IS NULL)::int AS unassigned
            FROM leads
            ${where}
        `, values);

        res.json(result.rows[0]);
    } catch (err) {
        console.error("ANALYTICS ERROR:", err);
        res.status(500).json({ message: "Analytics failed" });
    }
});

module.exports = router;
