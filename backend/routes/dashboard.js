const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");

function cleanText(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
}

function isHigherAuthority(req) {
    if (req.user?.is_higher_authority === true) return true;

    return [
        "admin",
        "super_admin",
        "owner",
        "director",
        "ceo"
    ].includes(normalizeRole(req.user?.role));
}

function appendLeadScope(req, clauses, values, alias = "l") {
    if (isHigherAuthority(req)) return;

    const dataScope = cleanText(req.user?.data_scope || "OWN").toUpperCase();

    if (["BRANCH", "DEPARTMENT", "TEAM", "VIEW_ONLY"].includes(dataScope) && req.user?.branch_id) {
        values.push(req.user.branch_id);
        clauses.push(`${alias}.branch_id = $${values.length}`);
        return;
    }

    values.push(req.user.id);
    clauses.push(`${alias}.assigned_to = $${values.length}`);
}

function appendInventoryScope(req, clauses, values, alias = "i") {
    if (isHigherAuthority(req)) return;

    if (req.user?.branch_id) {
        values.push(req.user.branch_id);
        clauses.push(`${alias}.branch_id = $${values.length}`);
    }

    const categoryScope = cleanText(req.user?.vehicle_category_scope || "ALL").toUpperCase();

    if (["AD", "EV"].includes(categoryScope)) {
        values.push(categoryScope);
        clauses.push(`${alias}.vehicle_category = $${values.length}`);
    }
}

async function tableExists(tableName) {
    const result = await db.query(`
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = $1
        ) AS exists
    `, [tableName]);

    return result.rows[0]?.exists === true;
}

async function safeCount(sql, values = []) {
    try {
        const result = await db.query(sql, values);
        return Number(result.rows[0]?.count || 0);
    } catch (err) {
        console.warn("DASHBOARD COUNT FALLBACK:", err.message);
        return 0;
    }
}

async function safeRows(sql, values = []) {
    try {
        const result = await db.query(sql, values);
        return result.rows;
    } catch (err) {
        console.warn("DASHBOARD ROWS FALLBACK:", err.message);
        return [];
    }
}

/* =====================================================
   OPERATIONAL INTELLIGENCE SUMMARY
===================================================== */
router.get("/summary", auth, async (req, res) => {
    try {
        const leadClauses = ["COALESCE(l.status, '') <> 'DELETED'"];
        const leadValues = [];

        appendLeadScope(req, leadClauses, leadValues, "l");

        const leadWhere = `WHERE ${leadClauses.join(" AND ")}`;

        const total = await safeCount(`
            SELECT COUNT(*) AS count
            FROM leads l
            ${leadWhere}
        `, leadValues);

        const today = await safeCount(`
            SELECT COUNT(*) AS count
            FROM leads l
            ${leadWhere}
            AND l.created_at::date = CURRENT_DATE
        `, leadValues);

        const hot = await safeCount(`
            SELECT COUNT(*) AS count
            FROM leads l
            ${leadWhere}
            AND UPPER(COALESCE(l.priority, '')) = 'HOT'
        `, leadValues);

        const warm = await safeCount(`
            SELECT COUNT(*) AS count
            FROM leads l
            ${leadWhere}
            AND UPPER(COALESCE(l.priority, '')) = 'WARM'
        `, leadValues);

        const cold = await safeCount(`
            SELECT COUNT(*) AS count
            FROM leads l
            ${leadWhere}
            AND UPPER(COALESCE(l.priority, 'COLD')) = 'COLD'
        `, leadValues);

        const booked = await safeCount(`
            SELECT COUNT(*) AS count
            FROM leads l
            ${leadWhere}
            AND UPPER(COALESCE(l.status, '')) = 'BOOKED'
        `, leadValues);

        const closed = await safeCount(`
            SELECT COUNT(*) AS count
            FROM leads l
            ${leadWhere}
            AND UPPER(COALESCE(l.status, '')) = 'CLOSED'
        `, leadValues);

        const todayFollowups = await safeCount(`
            SELECT COUNT(*) AS count
            FROM leads l
            ${leadWhere}
            AND l.next_followup_at::date = CURRENT_DATE
            AND UPPER(COALESCE(l.status, '')) NOT IN ('CLOSED', 'LOST')
        `, leadValues);

        const overdueFollowups = await safeCount(`
            SELECT COUNT(*) AS count
            FROM leads l
            ${leadWhere}
            AND l.next_followup_at IS NOT NULL
            AND l.next_followup_at < NOW()
            AND UPPER(COALESCE(l.status, '')) NOT IN ('CLOSED', 'LOST')
        `, leadValues);

        const bookingCount = await safeCount(`
            SELECT COUNT(*) AS count
            FROM bookings b
            LEFT JOIN leads l ON l.id = b.lead_id
            ${leadWhere.replaceAll("l.", "l.")}
            AND COALESCE(b.booking_status, '') <> 'CANCELLED'
        `, leadValues);

        const retailCount = await safeCount(`
            SELECT COUNT(*) AS count
            FROM bookings b
            LEFT JOIN leads l ON l.id = b.lead_id
            ${leadWhere.replaceAll("l.", "l.")}
            AND UPPER(COALESCE(b.retail_status, '')) IN ('INVOICED', 'RETAILED')
        `, leadValues);

        const deliveryCount = await safeCount(`
            SELECT COUNT(*) AS count
            FROM delivery_checklists d
            LEFT JOIN leads l ON l.id = d.lead_id
            ${leadWhere.replaceAll("l.", "l.")}
            AND d.actual_delivery_date IS NOT NULL
        `, leadValues);

        const blockedDeliveries = await safeCount(`
            SELECT COUNT(*) AS count
            FROM delivery_checklists d
            LEFT JOIN leads l ON l.id = d.lead_id
            ${leadWhere.replaceAll("l.", "l.")}
            AND UPPER(COALESCE(d.delivery_status, '')) = 'BLOCKED'
        `, leadValues);

        const invClauses = ["COALESCE(i.status, 'ACTIVE') = 'ACTIVE'"];
        const invValues = [];
        appendInventoryScope(req, invClauses, invValues, "i");
        const invWhere = `WHERE ${invClauses.join(" AND ")}`;

        const availableStock = await safeCount(`
            SELECT COUNT(*) AS count
            FROM vehicle_inventory_units i
            ${invWhere}
            AND UPPER(COALESCE(i.vehicle_status, '')) = 'AVAILABLE'
        `, invValues);

        const allocatedStock = await safeCount(`
            SELECT COUNT(*) AS count
            FROM vehicle_inventory_units i
            ${invWhere}
            AND UPPER(COALESCE(i.vehicle_status, '')) = 'ALLOCATED_TO_CUSTOMER'
        `, invValues);

        const agedStock = await safeCount(`
            SELECT COUNT(*) AS count
            FROM vehicle_inventory_units i
            ${invWhere}
            AND i.actual_arrival_date IS NOT NULL
            AND i.actual_arrival_date < CURRENT_DATE - INTERVAL '45 days'
            AND UPPER(COALESCE(i.vehicle_status, '')) NOT IN ('DELIVERED', 'RETAIL_DONE')
        `, invValues);

        const recentActivities = await safeRows(`
            SELECT
                a.id,
                a.action,
                a.remarks,
                COALESCE(a.module_name, 'GENERAL') AS module_name,
                COALESCE(a.severity, 'INFO') AS severity,
                a.created_at,
                u.name AS user_name
            FROM activity_logs a
            LEFT JOIN users u ON u.id = a.user_id
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT 8
        `);

        const topUsers = await safeRows(`
            SELECT
                COALESCE(u.name, 'System') AS user_name,
                COALESCE(u.role, '-') AS role,
                COUNT(*)::int AS activity_count
            FROM activity_logs a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE a.created_at >= NOW() - INTERVAL '7 days'
            GROUP BY COALESCE(u.name, 'System'), COALESCE(u.role, '-')
            ORDER BY activity_count DESC
            LIMIT 5
        `);

        const leadStatus = await safeRows(`
            SELECT
                COALESCE(l.status, 'NEW') AS status,
                COUNT(*)::int AS count
            FROM leads l
            ${leadWhere}
            GROUP BY COALESCE(l.status, 'NEW')
            ORDER BY count DESC
        `, leadValues);

        res.json({
            total,
            today,
            hot,
            warm,
            cold,
            booked,
            closed,
            today_followups: todayFollowups,
            overdue_followups: overdueFollowups,

            bookings: bookingCount,
            retail: retailCount,
            deliveries: deliveryCount,
            blocked_deliveries: blockedDeliveries,

            available_stock: availableStock,
            allocated_stock: allocatedStock,
            aged_stock: agedStock,

            alerts: {
                missed_followups: overdueFollowups,
                blocked_deliveries: blockedDeliveries,
                aged_stock: agedStock,
                pending_delivery: Math.max(retailCount - deliveryCount, 0)
            },

            lead_status: leadStatus,
            recent_activities: recentActivities,
            top_users: topUsers
        });

    } catch (err) {
        console.error("DASHBOARD SUMMARY ERROR:", err);
        res.status(500).json({
            message: "Failed to load dashboard intelligence"
        });
    }
});

module.exports = router;
