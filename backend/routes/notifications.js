const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");
const notificationService = require("../services/notificationService");

function parseId(value) {
    if (value === "" || value === null || value === undefined) return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

router.get("/", auth, async (req, res) => {
    try {
        await notificationService.ensureSchema(db);

        const values = [];
        const clauses = ["1=1"];

        const role = String(req.user?.role || "").toLowerCase();
        const highAuthority = ["admin", "super_admin", "manager", "sales_manager", "branch_manager", "bm", "dgm", "gm", "md", "ceo"].includes(role);

        if (!highAuthority) {
            values.push(req.user.id);
            clauses.push(`n.assigned_to = $${values.length}`);
        } else if (req.query.mine === "true") {
            values.push(req.user.id);
            clauses.push(`n.assigned_to = $${values.length}`);
        }

        if (req.query.unread === "true") {
            clauses.push(`n.is_read = false`);
        }

        const result = await db.query(`
            SELECT
                n.*,
                u.name AS assigned_user_name,
                cu.name AS created_by_name,
                l.name AS lead_name,
                l.phone AS lead_phone
            FROM notifications n
            LEFT JOIN users u ON u.id = n.assigned_to
            LEFT JOIN users cu ON cu.id = n.created_by
            LEFT JOIN leads l ON l.id = n.lead_id
            WHERE ${clauses.join(" AND ")}
            ORDER BY n.is_read ASC, n.created_at DESC
            LIMIT 300
        `, values);

        res.json(result.rows);

    } catch (err) {
        console.error("NOTIFICATION LIST ERROR:", err);
        res.status(500).json({ message: "Failed to load notifications" });
    }
});

router.get("/count", auth, async (req, res) => {
    try {
        await notificationService.ensureSchema(db);

        const result = await db.query(`
            SELECT COUNT(*)::int AS unread
            FROM notifications
            WHERE assigned_to=$1
            AND is_read=false
        `, [req.user.id]);

        res.json({ unread: result.rows[0]?.unread || 0 });

    } catch (err) {
        console.error("NOTIFICATION COUNT ERROR:", err);
        res.status(500).json({ message: "Failed to load notification count" });
    }
});

router.post("/", auth, async (req, res) => {
    try {
        const row = await notificationService.createNotification(db, {
            ...req.body,
            created_by: req.user.id
        });

        res.status(201).json({ message: "Notification created", notification: row });

    } catch (err) {
        console.error("NOTIFICATION CREATE ERROR:", err);
        res.status(500).json({ message: "Failed to create notification" });
    }
});

router.put("/:id/read", auth, async (req, res) => {
    try {
        await notificationService.ensureSchema(db);

        const id = parseId(req.params.id);
        if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid notification id" });

        const result = await db.query(`
            UPDATE notifications
            SET is_read=true, read_at=NOW()
            WHERE id=$1
            RETURNING *
        `, [id]);

        if (!result.rows.length) return res.status(404).json({ message: "Notification not found" });

        res.json({ message: "Notification marked as read", notification: result.rows[0] });

    } catch (err) {
        console.error("NOTIFICATION READ ERROR:", err);
        res.status(500).json({ message: "Failed to mark notification read" });
    }
});

router.post("/scan", auth, async (req, res) => {
    try {
        const missed = await notificationService.createMissedFollowupAlerts(db);
        const approvals = await notificationService.createPendingApprovalAlerts(db);

        res.json({
            message: "Notification scan completed",
            created: {
                missed_followups: missed,
                approvals
            }
        });

    } catch (err) {
        console.error("NOTIFICATION SCAN ERROR:", err);
        res.status(500).json({ message: "Failed to scan notifications" });
    }
});

module.exports = router;
