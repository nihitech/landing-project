const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
}

function requireAdmin(req, res, next) {
    if (normalizeRole(req.user?.role) !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
    }
    next();
}

// ✅ DAILY REPORT
router.get("/daily", auth, requireAdmin, async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().slice(0, 10);

        const from = `${date} 00:00:00`;
        const to = `${date} 23:59:59`;

        const overview = await db.query(`
            SELECT
                COUNT(*)::int AS total_leads,
                COUNT(*) FILTER (WHERE priority='HOT')::int AS hot,
                COUNT(*) FILTER (WHERE priority='WARM')::int AS warm,
                COUNT(*) FILTER (WHERE priority='COLD')::int AS cold,
                COUNT(*) FILTER (WHERE status='BOOKED')::int AS booked,
                COUNT(*) FILTER (WHERE status='CLOSED')::int AS closed,
                COUNT(*) FILTER (WHERE status='LOST')::int AS lost,
                COUNT(*) FILTER (WHERE assigned_to IS NULL)::int AS unassigned
            FROM leads
            WHERE created_at BETWEEN $1 AND $2
        `, [from, to]);

        const sourceSummary = await db.query(`
            SELECT COALESCE(source, 'UNKNOWN') AS source, COUNT(*)::int AS count
            FROM leads
            WHERE created_at BETWEEN $1 AND $2
            GROUP BY COALESCE(source, 'UNKNOWN')
            ORDER BY count DESC
        `, [from, to]);

        const userPerformance = await db.query(`
            SELECT
                u.name,
                u.email,
                COUNT(l.id)::int AS assigned_leads,
                COUNT(l.id) FILTER (WHERE l.priority='HOT')::int AS hot_leads,
                COUNT(l.id) FILTER (WHERE l.status='TEST-DRIVE')::int AS test_drives,
                COUNT(l.id) FILTER (WHERE l.status='BOOKED')::int AS booked,
                COUNT(l.id) FILTER (WHERE l.status='CLOSED')::int AS closed,
                COUNT(l.id) FILTER (
                    WHERE l.next_followup_at < NOW()
                    AND l.status NOT IN ('CLOSED','LOST')
                )::int AS missed_followups
            FROM users u
            LEFT JOIN leads l
                ON l.assigned_to = u.id
                AND l.created_at BETWEEN $1 AND $2
            WHERE LOWER(u.role) = 'sales'
            GROUP BY u.id, u.name, u.email
            ORDER BY assigned_leads DESC
        `, [from, to]);

        const recentLeads = await db.query(`
            SELECT
                l.name,
                l.phone,
                l.car_interest,
                l.source,
                l.priority,
                l.status,
                u.name AS assigned_name
            FROM leads l
            LEFT JOIN users u ON l.assigned_to = u.id
            WHERE l.created_at BETWEEN $1 AND $2
            ORDER BY l.created_at DESC
            LIMIT 50
        `, [from, to]);

        const report = {
            type: "daily",
            label: date,
            overview: overview.rows[0],
            source_summary: sourceSummary.rows,
            model_summary: [],
            user_performance: userPerformance.rows,
            recent_leads: recentLeads.rows,
            followups: {
                missed_or_due_followups: Number(overview.rows[0].missed_followups || 0)
            }
        };

        report.whatsapp_summary = `📊 Daily CRM Report
Date: ${date}

Total Leads: ${report.overview.total_leads}
Hot: ${report.overview.hot}
Warm: ${report.overview.warm}
Cold: ${report.overview.cold}

Booked: ${report.overview.booked}
Closed: ${report.overview.closed}
Lost: ${report.overview.lost}

Unassigned Leads: ${report.overview.unassigned}

Please review missed follow-ups and hot leads.`;

        res.json(report);

    } catch (err) {
        console.error("DAILY REPORT ERROR:", err);
        res.status(500).json({ message: "Daily report failed", error: err.message });
    }
});

module.exports = router;