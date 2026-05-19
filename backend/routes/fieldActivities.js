const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");

let activityLogger = null;
try {
    activityLogger = require("../utils/activityLogger");
} catch (err) {
    activityLogger = null;
}

async function audit(payload) {
    if (activityLogger?.logActivity) {
        return activityLogger.logActivity(payload);
    }
}

function cleanText(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
}

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
    if (isHigherAuthority(req) || req.user?.can_view === true || req.user?.can_monitor === true || hasPermission(req, "field_activity.view")) {
        return next();
    }
    return res.status(403).json({ message: "You do not have permission to view field activities" });
}

function requireActivityManage(req, res, next) {
    if (isHigherAuthority(req) || req.user?.can_edit === true || hasPermission(req, "field_activity.manage")) {
        return next();
    }
    return res.status(403).json({ message: "You do not have permission to manage field activities" });
}

function requireCheckIn(req, res, next) {
    if (
        isHigherAuthority(req) ||
        req.user?.can_edit === true ||
        hasPermission(req, "field_activity.checkin") ||
        ["sales", "manager", "team_leader", "field"].includes(normalizeRole(req.user?.role))
    ) {
        return next();
    }
    return res.status(403).json({ message: "You do not have permission to check in to field activity" });
}

function parseId(value) {
    if (value === "" || value === null || value === undefined) return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

function parseNumber(value, fallback = null) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeActivityType(value) {
    const type = cleanText(value || "FIELD_VISIT").toUpperCase().replace(/[\s-]+/g, "_");
    return [
        "STALL", "EVENT", "WORKSHOP", "PROMOTION", "REFERRAL",
        "FIELD_VISIT", "FIELD_ACTIVITY", "ROADSHOW", "CORPORATE_VISIT",
        "SERVICE_CAMP", "SHOWROOM_ACTIVITY", "OTHER"
    ].includes(type) ? type : "FIELD_VISIT";
}

function normalizeLocationMode(value) {
    const mode = cleanText(value || "FIXED").toUpperCase();
    return ["FIXED", "AREA", "MOVING", "MULTI_POINT"].includes(mode) ? mode : "FIXED";
}

function normalizeStatus(value, fallback = "PLANNED") {
    const status = cleanText(value || fallback).toUpperCase();
    return ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED", "ON_HOLD"].includes(status) ? status : fallback;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = value => (Number(value) * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function validationStatus(distance, allowedRadius, warningRadius) {
    if (distance === null || distance === undefined) return "UNKNOWN";
    if (distance <= allowedRadius) return "VALID";
    if (distance <= warningRadius) return "WARNING";
    return "OUTSIDE_RANGE";
}

async function ensureFieldActivitySchema() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS field_activities (
            id SERIAL PRIMARY KEY,
            activity_name VARCHAR(200) NOT NULL,
            activity_type VARCHAR(80) DEFAULT 'FIELD_VISIT',
            source_type VARCHAR(80),
            description TEXT,
            branch_id INTEGER REFERENCES branches(id),
            location_name VARCHAR(200),
            address TEXT,
            target_latitude NUMERIC(12,8),
            target_longitude NUMERIC(12,8),
            allowed_radius_meters INTEGER DEFAULT 800,
            warning_radius_meters INTEGER DEFAULT 1500,
            location_mode VARCHAR(40) DEFAULT 'FIXED',
            strict_validation BOOLEAN DEFAULT false,
            activity_date DATE,
            start_time TIMESTAMP,
            end_time TIMESTAMP,
            expected_duration_minutes INTEGER DEFAULT 0,
            expected_leads_count INTEGER DEFAULT 0,
            status VARCHAR(40) DEFAULT 'PLANNED',
            created_by INTEGER REFERENCES users(id),
            updated_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS field_activity_assignments (
            id SERIAL PRIMARY KEY,
            activity_id INTEGER REFERENCES field_activities(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id),
            assigned_by INTEGER REFERENCES users(id),
            assignment_status VARCHAR(40) DEFAULT 'ASSIGNED',
            remarks TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(activity_id, user_id)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS field_activity_attendance (
            id SERIAL PRIMARY KEY,
            activity_id INTEGER REFERENCES field_activities(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id),
            check_type VARCHAR(30) DEFAULT 'CHECK_IN',
            latitude NUMERIC(12,8),
            longitude NUMERIC(12,8),
            distance_meters INTEGER,
            validation_status VARCHAR(40),
            device_info TEXT,
            remarks TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`
        ALTER TABLE leads
        ADD COLUMN IF NOT EXISTS field_activity_id INTEGER REFERENCES field_activities(id),
        ADD COLUMN IF NOT EXISTS field_activity_source VARCHAR(100),
        ADD COLUMN IF NOT EXISTS lead_capture_latitude NUMERIC(12,8),
        ADD COLUMN IF NOT EXISTS lead_capture_longitude NUMERIC(12,8)
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_field_activities_branch ON field_activities(branch_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_field_activities_status ON field_activities(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_field_activity_assignments_user ON field_activity_assignments(user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_field_activity_attendance_activity ON field_activity_attendance(activity_id)`);
}

function appendActivityScope(req, clauses, values, alias = "fa") {
    if (isHigherAuthority(req)) return;
    if (req.user?.branch_id) {
        values.push(req.user.branch_id);
        clauses.push(`(${alias}.branch_id = $${values.length} OR ${alias}.branch_id IS NULL)`);
    }
}

router.get("/", auth, requireActivityView, async (req, res) => {
    try {
        await ensureFieldActivitySchema();
        const clauses = ["1=1"];
        const values = [];
        appendActivityScope(req, clauses, values, "fa");

        if (!isHigherAuthority(req) && normalizeRole(req.user?.role) === "sales") {
            values.push(req.user.id);
            clauses.push(`EXISTS (
                SELECT 1 FROM field_activity_assignments faa
                WHERE faa.activity_id = fa.id AND faa.user_id = $${values.length}
            )`);
        }

        if (req.query.status) {
            values.push(normalizeStatus(req.query.status));
            clauses.push(`fa.status = $${values.length}`);
        }

        if (req.query.activity_type) {
            values.push(normalizeActivityType(req.query.activity_type));
            clauses.push(`fa.activity_type = $${values.length}`);
        }

        if (req.query.search) {
            values.push(`%${cleanText(req.query.search).toLowerCase()}%`);
            clauses.push(`(
                LOWER(COALESCE(fa.activity_name,'')) LIKE $${values.length}
                OR LOWER(COALESCE(fa.location_name,'')) LIKE $${values.length}
                OR LOWER(COALESCE(fa.address,'')) LIKE $${values.length}
            )`);
        }

        const result = await db.query(`
            SELECT
                fa.*,
                b.branch_name,
                b.branch_code,
                u.name AS created_by_name,
                COUNT(DISTINCT faa.user_id)::int AS assigned_users_count,
                COUNT(DISTINCT l.id)::int AS captured_leads_count
            FROM field_activities fa
            LEFT JOIN branches b ON b.id = fa.branch_id
            LEFT JOIN users u ON u.id = fa.created_by
            LEFT JOIN field_activity_assignments faa ON faa.activity_id = fa.id
            LEFT JOIN leads l ON l.field_activity_id = fa.id
            WHERE ${clauses.join(" AND ")}
            GROUP BY fa.id, b.branch_name, b.branch_code, u.name
            ORDER BY fa.activity_date DESC NULLS LAST, fa.id DESC
            LIMIT 500
        `, values);

        res.json(result.rows);
    } catch (err) {
        console.error("FIELD ACTIVITY LIST ERROR:", err);
        res.status(500).json({ message: "Failed to load field activities" });
    }
});

router.post("/", auth, requireActivityManage, async (req, res) => {
    try {
        await ensureFieldActivitySchema();

        const branchId = parseId(req.body.branch_id || req.user?.branch_id);
        if (Number.isNaN(branchId)) return res.status(400).json({ message: "Invalid branch selected" });

        const activityName = cleanText(req.body.activity_name);
        if (!activityName) return res.status(400).json({ message: "Activity name is required" });

        const assignedUserIds = Array.isArray(req.body.assigned_user_ids)
            ? req.body.assigned_user_ids.map(parseId).filter(id => Number.isInteger(id))
            : [];

        const allowedRadius = Math.max(parseNumber(req.body.allowed_radius_meters, 800), 100);
        const warningRadius = Math.max(parseNumber(req.body.warning_radius_meters, 1500), allowedRadius);

        const result = await db.query(`
            INSERT INTO field_activities
            (
                activity_name, activity_type, source_type, description, branch_id,
                location_name, address, target_latitude, target_longitude,
                allowed_radius_meters, warning_radius_meters, location_mode, strict_validation,
                activity_date, start_time, end_time, expected_duration_minutes,
                expected_leads_count, status, created_by, updated_by
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
            RETURNING *
        `, [
            activityName,
            normalizeActivityType(req.body.activity_type),
            cleanText(req.body.source_type),
            cleanText(req.body.description),
            branchId,
            cleanText(req.body.location_name),
            cleanText(req.body.address),
            parseNumber(req.body.target_latitude),
            parseNumber(req.body.target_longitude),
            allowedRadius,
            warningRadius,
            normalizeLocationMode(req.body.location_mode),
            req.body.strict_validation === true || req.body.strict_validation === "true",
            req.body.activity_date || null,
            req.body.start_time || null,
            req.body.end_time || null,
            parseNumber(req.body.expected_duration_minutes, 0),
            parseNumber(req.body.expected_leads_count, 0),
            normalizeStatus(req.body.status || "PLANNED"),
            req.user.id,
            req.user.id
        ]);

        const activity = result.rows[0];

        for (const userId of assignedUserIds) {
            await db.query(`
                INSERT INTO field_activity_assignments (activity_id, user_id, assigned_by)
                VALUES ($1,$2,$3)
                ON CONFLICT (activity_id, user_id) DO NOTHING
            `, [activity.id, userId, req.user.id]);
        }

        await audit({
            req,
            user_id: req.user.id,
            action: "FIELD_ACTIVITY_CREATED",
            module_name: "FIELD_ACTIVITY",
            entity_type: "FIELD_ACTIVITY",
            entity_id: activity.id,
            branch_id: branchId,
            new_value: activity.status,
            remarks: `Field activity created: ${activity.activity_name}`
        });

        res.status(201).json({ message: "Field activity created successfully", activity });
    } catch (err) {
        console.error("FIELD ACTIVITY CREATE ERROR:", err);
        res.status(500).json({ message: "Failed to create field activity" });
    }
});

router.post("/:id/check", auth, requireCheckIn, async (req, res) => {
    try {
        await ensureFieldActivitySchema();

        const activityId = parseId(req.params.id);
        if (!activityId) return res.status(400).json({ message: "Invalid activity id" });

        const checkType = cleanText(req.body.check_type || "CHECK_IN").toUpperCase() === "CHECK_OUT" ? "CHECK_OUT" : "CHECK_IN";
        const latitude = parseNumber(req.body.latitude);
        const longitude = parseNumber(req.body.longitude);

        if (latitude === null || longitude === null) {
            return res.status(400).json({ message: "Latitude and longitude are required" });
        }

        const activityResult = await db.query(`SELECT * FROM field_activities WHERE id = $1 LIMIT 1`, [activityId]);
        if (!activityResult.rows.length) return res.status(404).json({ message: "Field activity not found" });

        const activity = activityResult.rows[0];

        if (!isHigherAuthority(req)) {
            const assignment = await db.query(`
                SELECT id FROM field_activity_assignments
                WHERE activity_id = $1 AND user_id = $2 LIMIT 1
            `, [activityId, req.user.id]);

            if (!assignment.rows.length) return res.status(403).json({ message: "You are not assigned to this field activity" });
        }

        let distance = null;
        if (activity.target_latitude && activity.target_longitude) {
            distance = haversineMeters(Number(activity.target_latitude), Number(activity.target_longitude), latitude, longitude);
        }

        const status = validationStatus(distance, Number(activity.allowed_radius_meters || 800), Number(activity.warning_radius_meters || 1500));

        if (activity.strict_validation === true && status === "OUTSIDE_RANGE") {
            await audit({
                req,
                user_id: req.user.id,
                action: "FIELD_ACTIVITY_CHECK_REJECTED",
                module_name: "FIELD_ACTIVITY",
                entity_type: "FIELD_ACTIVITY",
                entity_id: activityId,
                branch_id: activity.branch_id,
                severity: "WARNING",
                remarks: `${checkType} rejected. Distance: ${distance || "-"}m`
            });

            return res.status(400).json({
                message: "You are outside the approved activity location range",
                distance_meters: distance,
                validation_status: status
            });
        }

        const result = await db.query(`
            INSERT INTO field_activity_attendance
            (activity_id, user_id, check_type, latitude, longitude, distance_meters, validation_status, device_info, remarks)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *
        `, [
            activityId,
            req.user.id,
            checkType,
            latitude,
            longitude,
            distance,
            status,
            cleanText(req.body.device_info),
            cleanText(req.body.remarks)
        ]);

        await audit({
            req,
            user_id: req.user.id,
            action: `FIELD_ACTIVITY_${checkType}`,
            module_name: "FIELD_ACTIVITY",
            entity_type: "FIELD_ACTIVITY_ATTENDANCE",
            entity_id: result.rows[0].id,
            branch_id: activity.branch_id,
            severity: status === "OUTSIDE_RANGE" ? "WARNING" : "INFO",
            new_value: status,
            remarks: `${checkType} recorded for ${activity.activity_name}. Distance: ${distance || "-"}m. Status: ${status}.`
        });

        res.json({
            message: `${checkType.replace("_", " ")} recorded successfully`,
            attendance: result.rows[0],
            distance_meters: distance,
            validation_status: status
        });
    } catch (err) {
        console.error("FIELD ACTIVITY CHECK ERROR:", err);
        res.status(500).json({ message: "Failed to record field activity check" });
    }
});

router.get("/:id/attendance", auth, requireActivityView, async (req, res) => {
    try {
        await ensureFieldActivitySchema();

        const activityId = parseId(req.params.id);
        if (!activityId) return res.status(400).json({ message: "Invalid activity id" });

        const result = await db.query(`
            SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role
            FROM field_activity_attendance a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE a.activity_id = $1
            ORDER BY a.created_at DESC
        `, [activityId]);

        res.json(result.rows);
    } catch (err) {
        console.error("FIELD ACTIVITY ATTENDANCE ERROR:", err);
        res.status(500).json({ message: "Failed to load attendance" });
    }
});

router.get("/summary/dashboard", auth, requireActivityView, async (req, res) => {
    try {
        await ensureFieldActivitySchema();

        const result = await db.query(`
            SELECT
                COUNT(*)::int AS total_activities,
                COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_activities,
                COUNT(*) FILTER (WHERE status = 'PLANNED')::int AS planned_activities,
                COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_activities,
                (SELECT COUNT(*)::int FROM field_activity_attendance WHERE created_at::date = CURRENT_DATE) AS today_checks,
                (SELECT COUNT(*)::int FROM field_activity_attendance WHERE validation_status = 'OUTSIDE_RANGE') AS outside_range_checks
            FROM field_activities
        `);

        res.json(result.rows[0]);
    } catch (err) {
        console.error("FIELD ACTIVITY SUMMARY ERROR:", err);
        res.status(500).json({ message: "Failed to load field activity summary" });
    }
});

module.exports = router;
