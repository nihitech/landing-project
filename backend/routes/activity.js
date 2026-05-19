
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middleware/auth");
const { ensureActivityLogSchema } = require("../utils/activityLogger");

function cleanText(value, fallback = "") { return String(value ?? fallback).trim(); }
function normalizeRole(role) { return String(role || "").trim().toLowerCase(); }

function isHigherAuthority(req) {
    if (req.user?.is_higher_authority === true) return true;
    return ["admin", "super_admin", "owner", "director", "ceo"].includes(normalizeRole(req.user?.role));
}

function hasPermission(req, key) {
    if (isHigherAuthority(req)) return true;
    const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
    return permissions.includes(key);
}

function requireActivityView(req, res, next) {
    if (isHigherAuthority(req) || req.user?.can_monitor === true || hasPermission(req, "activity.view") || hasPermission(req, "reports.view")) {
        return next();
    }
    return res.status(403).json({ message: "You do not have permission to view activity intelligence" });
}

function parseId(value) {
    if (value === "" || value === null || value === undefined) return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

function safeLimit(value, fallback = 100, max = 500) {
    const limit = Number(value || fallback);
    if (!Number.isInteger(limit) || limit <= 0) return fallback;
    return Math.min(limit, max);
}

function appendAccessScope(req, clauses, values, alias = "a") {
    if (isHigherAuthority(req)) return;
    if (req.user?.branch_id) {
        values.push(req.user.branch_id);
        clauses.push(`(${alias}.branch_id = $${values.length} OR ${alias}.branch_id IS NULL)`);
    }
    if (req.user?.company_id) {
        values.push(req.user.company_id);
        clauses.push(`(${alias}.company_id = $${values.length} OR ${alias}.company_id IS NULL)`);
    }
}

router.get("/", auth, requireActivityView, async (req, res) => {
    try {
        await ensureActivityLogSchema();
        const clauses = ["1=1"];
        const values = [];
        appendAccessScope(req, clauses, values, "a");

        if (req.query.module_name) {
            values.push(cleanText(req.query.module_name).toUpperCase());
            clauses.push(`UPPER(COALESCE(a.module_name, 'GENERAL')) = $${values.length}`);
        }
        if (req.query.severity) {
            values.push(cleanText(req.query.severity).toUpperCase());
            clauses.push(`UPPER(COALESCE(a.severity, 'INFO')) = $${values.length}`);
        }
        if (req.query.user_id) {
            const userId = parseId(req.query.user_id);
            if (Number.isNaN(userId)) return res.status(400).json({ message: "Invalid user filter" });
            if (userId) { values.push(userId); clauses.push(`a.user_id = $${values.length}`); }
        }
        if (req.query.branch_id) {
            const branchId = parseId(req.query.branch_id);
            if (Number.isNaN(branchId)) return res.status(400).json({ message: "Invalid branch filter" });
            if (branchId) { values.push(branchId); clauses.push(`a.branch_id = $${values.length}`); }
        }
        if (req.query.date_from) { values.push(req.query.date_from); clauses.push(`a.created_at >= $${values.length}::date`); }
        if (req.query.date_to) { values.push(req.query.date_to); clauses.push(`a.created_at < ($${values.length}::date + INTERVAL '1 day')`); }
        if (req.query.search) {
            values.push(`%${cleanText(req.query.search).toLowerCase()}%`);
            clauses.push(`(
                LOWER(COALESCE(a.action, '')) LIKE $${values.length}
                OR LOWER(COALESCE(a.remarks, '')) LIKE $${values.length}
                OR LOWER(COALESCE(a.old_value, '')) LIKE $${values.length}
                OR LOWER(COALESCE(a.new_value, '')) LIKE $${values.length}
                OR LOWER(COALESCE(u.name, '')) LIKE $${values.length}
                OR LOWER(COALESCE(u.email, '')) LIKE $${values.length}
                OR LOWER(COALESCE(l.name, '')) LIKE $${values.length}
                OR LOWER(COALESCE(l.phone, '')) LIKE $${values.length}
            )`);
        }

        const limit = safeLimit(req.query.limit, 100, 500);
        const result = await db.query(`
            SELECT a.id, a.lead_id, a.user_id, a.action, a.old_value, a.new_value, a.remarks,
                   COALESCE(a.module_name, 'GENERAL') AS module_name,
                   COALESCE(a.entity_type, 'GENERAL') AS entity_type,
                   a.entity_id, a.branch_id, a.company_id,
                   COALESCE(a.severity, 'INFO') AS severity,
                   a.ip_address, a.user_agent, a.metadata, a.created_at,
                   u.name AS user_name, u.email AS user_email, u.role AS user_role,
                   l.name AS lead_name, l.phone AS lead_phone,
                   b.branch_name, b.branch_code
            FROM activity_logs a
            LEFT JOIN users u ON u.id = a.user_id
            LEFT JOIN leads l ON l.id = a.lead_id
            LEFT JOIN branches b ON b.id = a.branch_id
            WHERE ${clauses.join(" AND ")}
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT ${limit}
        `, values);
        res.json(result.rows);
    } catch (err) {
        console.error("ACTIVITY LIST ERROR:", err);
        res.status(500).json({ message: "Failed to load activity intelligence" });
    }
});

router.get("/summary", auth, requireActivityView, async (req, res) => {
    try {
        await ensureActivityLogSchema();
        const clauses = ["1=1"];
        const values = [];
        appendAccessScope(req, clauses, values, "a");
        const where = clauses.join(" AND ");

        const overview = await db.query(`
            SELECT COUNT(*)::int AS total_activities,
                   COUNT(*) FILTER (WHERE a.created_at::date = CURRENT_DATE)::int AS today_activities,
                   COUNT(*) FILTER (WHERE COALESCE(a.severity, 'INFO') = 'WARNING')::int AS warning_count,
                   COUNT(*) FILTER (WHERE COALESCE(a.severity, 'INFO') = 'CRITICAL')::int AS critical_count,
                   COUNT(DISTINCT a.user_id)::int AS active_users,
                   COUNT(DISTINCT COALESCE(a.module_name, 'GENERAL'))::int AS active_modules
            FROM activity_logs a
            WHERE ${where}
        `, values);

        const byModule = await db.query(`
            SELECT COALESCE(a.module_name, 'GENERAL') AS module_name, COUNT(*)::int AS count
            FROM activity_logs a
            WHERE ${where}
            GROUP BY COALESCE(a.module_name, 'GENERAL')
            ORDER BY count DESC
            LIMIT 10
        `, values);

        const byUser = await db.query(`
            SELECT COALESCE(u.name, 'System') AS user_name, COALESCE(u.role, '-') AS user_role, COUNT(*)::int AS count
            FROM activity_logs a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE ${where}
            GROUP BY COALESCE(u.name, 'System'), COALESCE(u.role, '-')
            ORDER BY count DESC
            LIMIT 10
        `, values);

        res.json({ overview: overview.rows[0], by_module: byModule.rows, by_user: byUser.rows });
    } catch (err) {
        console.error("ACTIVITY SUMMARY ERROR:", err);
        res.status(500).json({ message: "Failed to load activity summary" });
    }
});

router.get("/filters/options", auth, requireActivityView, async (req, res) => {
    try {
        await ensureActivityLogSchema();
        const modules = await db.query(`SELECT DISTINCT COALESCE(module_name, 'GENERAL') AS module_name FROM activity_logs ORDER BY module_name ASC`);
        const severities = await db.query(`SELECT DISTINCT COALESCE(severity, 'INFO') AS severity FROM activity_logs ORDER BY severity ASC`);
        res.json({
            modules: modules.rows.map(row => row.module_name),
            severities: severities.rows.map(row => row.severity)
        });
    } catch (err) {
        console.error("ACTIVITY FILTER OPTIONS ERROR:", err);
        res.status(500).json({ message: "Failed to load activity filters" });
    }
});

module.exports = router;
