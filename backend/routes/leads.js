const express = require("express");
const db = require("../config/db");
const sendWhatsApp = require("../services/whatsapp");
const { calculateScore, getLeadPriority } = require("../services/scoring");
const auth = require("../middleware/auth");

const router = express.Router();

const STATUSES = ["NEW", "CONTACTED", "FOLLOW-UP", "TEST-DRIVE", "BOOKED", "CLOSED", "LOST"];
const ACTIONS = ["ENQUIRY", "QUICK_ENQUIRY", "COMPLETE_ENQUIRY", "TEST_DRIVE", "CALL", "WHATSAPP", "VISIT", "BOOKING"];
const SOURCES = ["WEBSITE", "CALL_NOW", "WHATSAPP", "FACEBOOK", "INSTAGRAM", "GOOGLE_ADS", "MANUAL", "SHOWROOM"];

function normalizePhone(phone) {
    return String(phone || "").replace(/\D/g, "").slice(-10);
}

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
}

function requireAdmin(req, res, next) {
    if (normalizeRole(req.user?.role) !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
    }
    next();
}

function parseId(value) {
    if (value === "" || value === null || value === undefined) return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

function cleanText(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function normalizeAction(value) {
    const action = String(value || "ENQUIRY").trim().toUpperCase().replace(/[\s-]+/g, "_");
    return ACTIONS.includes(action) ? action : "ENQUIRY";
}

function normalizeSource(value) {
    const source = String(value || "WEBSITE").trim().toUpperCase().replace(/[\s-]+/g, "_");
    return SOURCES.includes(source) ? source : source || "WEBSITE";
}

function nullableDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

async function getLeastLoadedSalesUser() {
    const result = await db.query(`
        SELECT u.id, COUNT(l.id)::int AS lead_count
        FROM users u
        LEFT JOIN leads l ON l.assigned_to = u.id AND l.status NOT IN ('CLOSED','LOST')
        WHERE LOWER(u.role) = 'sales'
        GROUP BY u.id
        ORDER BY lead_count ASC, u.id ASC
        LIMIT 1
    `);
    return result.rows[0]?.id || null;
}

router.post("/lead", async (req, res) => {
    try {
        const data = req.body || {};
        const phone = normalizePhone(data.phone);
        const action = normalizeAction(data.action_type || data.lead_type);
        const source = normalizeSource(data.source || data.tracking?.utm_source || "WEBSITE");

        if (!data.name || phone.length !== 10) {
            return res.status(400).json({ message: "Name and valid phone are required" });
        }

        const tracking = data.tracking || {};
        const score = calculateScore({ ...data, phone, action_type: action, tracking });
        const priority = getLeadPriority(score).toUpperCase();;
        const now = new Date();

        const requestedAssign = parseId(data.assigned_to || data.user_id);

        let assignedTo = null;

        if (Number.isInteger(requestedAssign)) {
            assignedTo = requestedAssign;
        } else {
            assignedTo = await getLeastLoadedSalesUser();
        }
        console.log("AUTO ASSIGNED TO:", assignedTo);

        const result = await db.query(`
            INSERT INTO leads
            (
                name, phone, alternate_phone, email, area, district, profession, family_members,
                vehicle_category, fuel_type, car_interest, variant_interest, budget_range, purchase_timeline,
                exchange_vehicle, finance_required, action_type, lead_type, source, campaign_name, tracking,
                score, priority, status, assigned_to, notes,
                test_drive_date, showroom_visit_date, booking_expected_date,
                next_followup_at, followup_1, followup_2, followup_3
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'NEW',$24,$25,$26,$27,$28,$29,$30,$31,$32)
            RETURNING id, assigned_to
        `, [
            cleanText(data.name),
            phone,
            normalizePhone(data.alternate_phone),
            cleanText(data.email),
            cleanText(data.area),
            cleanText(data.district),
            cleanText(data.profession),
            cleanText(data.family_members),
            cleanText(data.vehicle_category),
            cleanText(data.fuel_type),
            cleanText(data.car_interest, "Not Selected"),
            cleanText(data.variant_interest),
            cleanText(data.budget_range),
            cleanText(data.purchase_timeline),
            cleanText(data.exchange_vehicle),
            cleanText(data.finance_required),
            action,
            cleanText(data.lead_type, action),
            source,
            cleanText(data.campaign_name || tracking.utm_campaign),
            JSON.stringify(tracking),
            score,
            priority,
            assignedTo,
            cleanText(data.notes),
            nullableDate(data.test_drive_date),
            nullableDate(data.showroom_visit_date),
            nullableDate(data.booking_expected_date),
            nullableDate(data.next_followup_at),
            new Date(now.getTime() + 5 * 60 * 1000),
            new Date(now.getTime() + 24 * 60 * 60 * 1000),
            new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
        ]);

        // Non-blocking WhatsApp notifications.
        sendWhatsApp(
            `whatsapp:+91${phone}`,
            `Hi ${cleanText(data.name)},\n\nThanks for your interest in ${cleanText(data.car_interest, "Mahindra")}. Our team will contact you shortly.\n\n- Shiva Automobiles`
        ).catch(err => console.error("WA Customer Error:", err.message));

        if (process.env.SALES_WHATSAPP_NUMBER) {
            sendWhatsApp(
                process.env.SALES_WHATSAPP_NUMBER,
                `New Lead 🚗\n\nName: ${cleanText(data.name)}\nPhone: ${phone}\nSource: ${source}\nType: ${action}\nCar: ${cleanText(data.car_interest, "Not Selected")}\nScore: ${score}\nPriority: ${priority}`
            ).catch(err => console.error("WA Sales Error:", err.message));
        }

        res.status(201).json({
            message: "Lead saved",
            id: result.rows[0].id,
            assigned_to: result.rows[0].assigned_to,
            score,
            priority
        });
    } catch (err) {
        console.error("SAVE LEAD ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/lead/:id/followup", auth, async (req, res) => {
    try {
        const leadId = parseId(req.params.id);
        if (!leadId) return res.status(400).json({ message: "Invalid lead id" });

        const callStatus = cleanText(req.body.call_status, "CONNECTED").toUpperCase().replace(/[\s-]+/g, "_");
        const response = cleanText(req.body.customer_response);
        const remarks = cleanText(req.body.remarks || req.body.followup_notes);
        const nextDate = nullableDate(req.body.next_followup_at);
        const nextStatus = String(req.body.next_status || req.body.status || "FOLLOW-UP").toUpperCase();
        const safeStatus = STATUSES.includes(nextStatus) ? nextStatus : "FOLLOW-UP";

        const values = [leadId];
        let ownerClause = "";
        if (normalizeRole(req.user.role) !== "admin") {
            values.push(req.user.id);
            ownerClause = `AND assigned_to = $2`;
        }
        const leadAccess = await db.query(`SELECT id FROM leads WHERE id=$1 ${ownerClause}`, values);
        if (!leadAccess.rows.length) return res.status(404).json({ message: "Lead not found or not assigned to you" });

        await db.query(`
            INSERT INTO lead_followups
            (lead_id, user_id, followup_type, call_status, customer_response, next_followup_at, remarks)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [leadId, req.user.id, "MANUAL", callStatus, response, nextDate, remarks]);

        await db.query(`
            UPDATE leads
            SET last_followup_at = NOW(),
                next_followup_at = $1,
                followup_count = COALESCE(followup_count,0) + 1,
                followup_notes = $2,
                notes = $2,
                status = $3,
                updated_at = NOW()
            WHERE id = $4
        `, [nextDate, remarks, safeStatus, leadId]);

        res.json({ message: "Follow-up saved" });
    } catch (err) {
        console.error("FOLLOWUP ERROR:", err);
        res.status(500).json({ message: "Follow-up error" });
    }
});


router.get("/leads", auth, async (req, res) => {
    try {
        const clauses = [];
        const values = [];

        if (normalizeRole(req.user.role) !== "admin") {
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

        if (req.query.source) {
            values.push(String(req.query.source).toUpperCase());
            clauses.push(`UPPER(l.source) = $${values.length}`);
        }

        if (req.query.search) {
            values.push(`%${String(req.query.search).toLowerCase()}%`);
            clauses.push(`(
                LOWER(l.name) LIKE $${values.length}
                OR l.phone LIKE $${values.length}
                OR LOWER(l.car_interest) LIKE $${values.length}
                OR LOWER(COALESCE(l.campaign_name,'')) LIKE $${values.length}
            )`);
        }

        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const result = await db.query(`
            SELECT l.*, u.name AS assigned_name, u.email AS assigned_email
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
router.get("/lead/:id/followups", auth, async (req, res) => {
    try {
        const leadId = parseId(req.params.id);
        if (!leadId) return res.status(400).json({ message: "Invalid lead id" });

        const values = [leadId];
        let ownerClause = "";
        if (normalizeRole(req.user.role) !== "admin") {
            values.push(req.user.id);
            ownerClause = "AND l.assigned_to=$2";
        }

        const access = await db.query(`SELECT id FROM leads l WHERE l.id=$1 ${ownerClause}`, values);
        if (!access.rows.length) return res.status(404).json({ message: "Lead not found or not assigned to you" });

        const result = await db.query(`
            SELECT f.*, u.name AS user_name
            FROM lead_followups f
            LEFT JOIN users u ON f.user_id = u.id
            WHERE f.lead_id=$1
            ORDER BY f.created_at DESC
        `, [leadId]);

        res.json(result.rows);
    } catch (err) {
        console.error("FOLLOWUP HISTORY ERROR:", err);
        res.status(500).json({ message: "Failed to load follow-ups" });
    }
});

router.put("/lead/:id/status", auth, async (req, res) => {
    try {
        const leadId = parseId(req.params.id);
        if (!leadId) return res.status(400).json({ message: "Invalid lead id" });

        const status = String(req.body.status || "").toUpperCase();
        if (!STATUSES.includes(status)) return res.status(400).json({ message: "Invalid status" });

        const values = [status, leadId];
        let ownerClause = "";
        if (normalizeRole(req.user.role) !== "admin") {
            values.push(req.user.id);
            ownerClause = `AND assigned_to = $3`;
        }

        const result = await db.query(`
            UPDATE leads
            SET status=$1, updated_at=NOW()
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
        const leadId = parseId(req.params.id);
        if (!leadId) return res.status(400).json({ message: "Invalid lead id" });

        const rawUserId = req.body.user_id ?? req.body.assigned_to ?? null;
        const userId = parseId(rawUserId);
        if (Number.isNaN(userId)) return res.status(400).json({ message: "Invalid user selected" });

        if (userId) {
            const user = await db.query("SELECT id, role FROM users WHERE id=$1 LIMIT 1", [userId]);
            if (!user.rows.length) return res.status(400).json({ message: "Selected user not found" });
            if (normalizeRole(user.rows[0].role) !== "sales") return res.status(400).json({ message: "Please select only sales user" });
        }

        const result = await db.query(`
            UPDATE leads
            SET assigned_to=$1, updated_at=NOW()
            WHERE id=$2
            RETURNING id, assigned_to
        `, [userId, leadId]);

        if (!result.rows.length) return res.status(404).json({ message: "Lead not found" });
        res.json({ message: userId ? "Lead assigned" : "Lead unassigned", lead: result.rows[0] });
    } catch (err) {
        console.error("ASSIGN ERROR:", err);
        res.status(500).json({ message: "Assign failed" });
    }
});

router.put("/lead/:id/notes", auth, async (req, res) => {
    try {
        const leadId = parseId(req.params.id);
        if (!leadId) return res.status(400).json({ message: "Invalid lead id" });

        const values = [cleanText(req.body.notes), leadId];
        let ownerClause = "";
        if (normalizeRole(req.user.role) !== "admin") {
            values.push(req.user.id);
            ownerClause = `AND assigned_to = $3`;
        }

        const result = await db.query(`
            UPDATE leads
            SET notes=$1, updated_at=NOW()
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
        if (normalizeRole(req.user.role) !== "admin") {
            values.push(req.user.id);
            where = "WHERE assigned_to=$1";
        }

        const result = await db.query(`
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE priority='HOT')::int AS hot,
                COUNT(*) FILTER (WHERE priority='WARM')::int AS warm,
                COUNT(*) FILTER (WHERE priority='COLD')::int AS cold,
                COUNT(*) FILTER (WHERE action_type IN ('ENQUIRY','QUICK_ENQUIRY','COMPLETE_ENQUIRY'))::int AS enquiry,
                COUNT(*) FILTER (WHERE action_type='TEST_DRIVE')::int AS testdrive,
                COUNT(*) FILTER (WHERE action_type='CALL')::int AS call,
                COUNT(*) FILTER (WHERE action_type='WHATSAPP')::int AS whatsapp,
                COUNT(*) FILTER (WHERE status='CLOSED')::int AS closed,
                COUNT(*) FILTER (WHERE status='BOOKED')::int AS booked,
                COUNT(*) FILTER (WHERE status='LOST')::int AS lost,
                COUNT(*) FILTER (WHERE assigned_to IS NULL)::int AS unassigned,
                COUNT(*) FILTER (WHERE next_followup_at::date = CURRENT_DATE)::int AS today_followups,
                COUNT(*) FILTER (WHERE next_followup_at < NOW() AND status NOT IN ('CLOSED','LOST'))::int AS overdue_followups
            FROM leads
            ${where}
        `, values);

        const bySource = await db.query(`
            SELECT COALESCE(source,'WEBSITE') AS source, COUNT(*)::int AS count
            FROM leads
            ${where}
            GROUP BY COALESCE(source,'WEBSITE')
            ORDER BY count DESC
        `, values);

        res.json({ ...result.rows[0], by_source: bySource.rows });
    } catch (err) {
        console.error("ANALYTICS ERROR:", err);
        res.status(500).json({ message: "Analytics failed" });
    }
});
// 🔐 UPDATE FULL LEAD DETAILS
router.put("/lead/:id", auth, async (req, res) => {
    try {
        const leadId = parseId(req.params.id);
        if (!leadId) {
            return res.status(400).json({ message: "Invalid lead id" });
        }

        const data = req.body || {};

        const values = [
            cleanText(data.name),                         // $1
            normalizePhone(data.phone),                   // $2
            normalizePhone(data.alternate_phone),         // $3
            cleanText(data.email),                        // $4
            cleanText(data.area),                         // $5
            cleanText(data.district),                     // $6
            cleanText(data.profession),                   // $7
            cleanText(data.family_members),               // $8
            cleanText(data.vehicle_category),             // $9
            cleanText(data.fuel_type),                    // $10
            cleanText(data.car_interest),                 // $11
            cleanText(data.variant_interest),             // $12
            cleanText(data.budget_range),                 // $13
            cleanText(data.purchase_timeline),            // $14
            cleanText(data.exchange_vehicle),             // $15
            cleanText(data.finance_required),             // $16
            cleanText(data.notes),                        // $17
            nullableDate(data.test_drive_date),           // $18
            nullableDate(data.showroom_visit_date),       // $19
            nullableDate(data.booking_expected_date),     // $20
            leadId                                        // $21
        ];

        let ownerClause = "";

        if (normalizeRole(req.user.role) !== "admin") {
            values.push(req.user.id);
            ownerClause = `AND assigned_to = $${values.length}`;
        }

        const result = await db.query(`
            UPDATE leads
            SET
                name = $1,
                phone = $2,
                alternate_phone = $3,
                email = $4,
                area = $5,
                district = $6,
                profession = $7,
                family_members = $8,
                vehicle_category = $9,
                fuel_type = $10,
                car_interest = $11,
                variant_interest = $12,
                budget_range = $13,
                purchase_timeline = $14,
                exchange_vehicle = $15,
                finance_required = $16,
                notes = $17,
                test_drive_date = $18,
                showroom_visit_date = $19,
                booking_expected_date = $20,
                lead_type = 'COMPLETE_ENQUIRY',
                action_type = 'COMPLETE_ENQUIRY',
                status = CASE WHEN status = 'NEW' THEN 'CONTACTED' ELSE status END,
                updated_at = NOW()
            WHERE id = $21 ${ownerClause}
            RETURNING *
        `, values);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Lead not found or not assigned to you" });
        }

        res.json({
            message: "Lead updated successfully",
            lead: result.rows[0]
        });

    } catch (err) {
        console.error("LEAD UPDATE ERROR:", err);
        res.status(500).json({ message: "Lead update failed" });
    }
});
// 🔥 AUTO ESCALATE OVERDUE FOLLOW-UPS
router.post("/followups/escalate", auth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            UPDATE leads
            SET priority = CASE
                WHEN next_followup_at < NOW() - INTERVAL '48 hours' THEN 'HOT'
                WHEN next_followup_at < NOW() - INTERVAL '24 hours' THEN 'WARM'
                ELSE priority
            END,
            updated_at = NOW()
            WHERE next_followup_at IS NOT NULL
            AND status NOT IN ('CLOSED', 'LOST')
            AND next_followup_at < NOW()
            RETURNING id, name, priority, next_followup_at
        `);

        res.json({
            message: "Overdue follow-ups escalated",
            updated: result.rows.length,
            leads: result.rows
        });

    } catch (err) {
        console.error("ESCALATION ERROR:", err);
        res.status(500).json({ message: "Escalation failed" });
    }
});
module.exports = router;
