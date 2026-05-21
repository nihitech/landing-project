/*
  NIKRION Central Assignment Intelligence Engine v1
  One assignment brain for QR, Quick Enquiry, Digital Leads and future workflows.
*/

function clean(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function parseId(value) {
    if (value === "" || value === null || value === undefined) return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeCategory(value) {
    const c = clean(value || "AD").toUpperCase();
    return ["AD", "EV"].includes(c) ? c : "AD";
}

function userCanHandleCategory(user, category) {
    const scope = clean(user?.vehicle_category_scope || "ALL").toUpperCase();
    return scope === "ALL" || scope === category;
}

function isSalesCapable(user) {
    const role = clean(user?.role).toLowerCase();
    const status = clean(user?.status || "ACTIVE").toUpperCase();

    return status === "ACTIVE" && [
        "sales",
        "sales_executive",
        "sales_consultant",
        "team_leader",
        "manager",
        "branch_manager",
        "field",
        "field_executive"
    ].includes(role);
}

async function defaultBranchId(db) {
    const result = await db.query(`
        SELECT id
        FROM branches
        WHERE branch_code = 'MAIN'
        ORDER BY id ASC
        LIMIT 1
    `);

    return result.rows[0]?.id || null;
}

async function getUser(db, userId) {
    const id = parseId(userId);
    if (!id) return null;

    const result = await db.query(`
        SELECT id, name, role, status, branch_id, vehicle_category_scope
        FROM users
        WHERE id = $1
        LIMIT 1
    `, [id]);

    return result.rows[0] || null;
}

async function workload(db, userId) {
    const id = parseId(userId);
    if (!id) {
        return { active_leads: 9999, overdue_followups: 9999, today_followups: 9999 };
    }

    const result = await db.query(`
        SELECT
            COUNT(*) FILTER (WHERE COALESCE(status, 'NEW') NOT IN ('CLOSED','LOST'))::int AS active_leads,
            COUNT(*) FILTER (
                WHERE COALESCE(status, 'NEW') NOT IN ('CLOSED','LOST')
                AND COALESCE(next_followup_at, next_followup_date) < NOW()
            )::int AS overdue_followups,
            COUNT(*) FILTER (
                WHERE COALESCE(status, 'NEW') NOT IN ('CLOSED','LOST')
                AND COALESCE(next_followup_at, next_followup_date)::date = CURRENT_DATE
            )::int AS today_followups
        FROM leads
        WHERE assigned_to = $1
    `, [id]);

    return result.rows[0] || { active_leads: 0, overdue_followups: 0, today_followups: 0 };
}

function scoreCandidate(user, load, branchId, category, boost = 0) {
    let score = 50 + boost;

    if (Number(user.branch_id) === Number(branchId)) score += 30;
    if (userCanHandleCategory(user, category)) score += 20;

    score -= Math.min(Number(load.active_leads || 0) * 1.5, 35);
    score -= Math.min(Number(load.overdue_followups || 0) * 4, 30);
    score -= Math.min(Number(load.today_followups || 0) * 1.2, 15);

    if (clean(user.role).toLowerCase().includes("manager")) score -= 8;

    return Math.max(0, Math.round(score));
}

async function fieldActivityOwner(db, fieldActivityId, createdBy) {
    const activityId = parseId(fieldActivityId);
    if (!activityId) return null;

    const result = await db.query(`
        SELECT
            fa.id,
            fa.branch_id,
            fa.created_by,
            faa.user_id AS assigned_user_id
        FROM field_activities fa
        LEFT JOIN field_activity_assignments faa ON faa.activity_id = fa.id
        WHERE fa.id = $1
        ORDER BY
            CASE WHEN faa.user_id = $2 THEN 0 ELSE 1 END,
            faa.id ASC
        LIMIT 1
    `, [activityId, parseId(createdBy) || 0]);

    return result.rows[0] || null;
}

async function bestLoadBalancedUser(db, branchId, category) {
    const result = await db.query(`
        SELECT id, name, role, status, branch_id, vehicle_category_scope
        FROM users
        WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
        AND branch_id = $1
        AND (
            COALESCE(vehicle_category_scope, 'ALL') = 'ALL'
            OR UPPER(COALESCE(vehicle_category_scope, 'ALL')) = $2
        )
        AND LOWER(COALESCE(role, '')) IN (
            'sales',
            'sales_executive',
            'sales_consultant',
            'team_leader',
            'manager',
            'branch_manager',
            'field',
            'field_executive'
        )
        ORDER BY id ASC
    `, [branchId, category]);

    const candidates = result.rows;
    if (!candidates.length) {
        return {
            assigned_to: null,
            confidence_score: 0,
            assignment_reason: "NO_ELIGIBLE_USER_FOUND"
        };
    }

    const scored = [];

    for (const user of candidates) {
        const load = await workload(db, user.id);
        scored.push({
            user,
            load,
            score: scoreCandidate(user, load, branchId, category)
        });
    }

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (Number(a.load.active_leads) !== Number(b.load.active_leads)) {
            return Number(a.load.active_leads) - Number(b.load.active_leads);
        }
        return Number(a.user.id) - Number(b.user.id);
    });

    return {
        assigned_to: scored[0].user.id,
        confidence_score: scored[0].score,
        assignment_reason: "BEST_BRANCH_CATEGORY_WORKLOAD_MATCH",
        workload: scored[0].load
    };
}

async function resolveAssignment(db, payload = {}) {
    const category = normalizeCategory(payload.vehicle_category);
    let branchId = parseId(payload.branch_id);
    if (!branchId) branchId = await defaultBranchId(db);

    const preferredId = parseId(payload.preferred_user_id);
    const createdBy = parseId(payload.created_by);
    const fieldActivityId = parseId(payload.field_activity_id);

    if (preferredId) {
        const preferred = await getUser(db, preferredId);
        if (
            preferred &&
            isSalesCapable(preferred) &&
            Number(preferred.branch_id) === Number(branchId) &&
            userCanHandleCategory(preferred, category)
        ) {
            return {
                assigned_to: preferred.id,
                branch_id: branchId,
                confidence_score: 95,
                assignment_reason: "PREFERRED_USER_VALID",
                engine_version: "central_v1"
            };
        }
    }

    if (fieldActivityId) {
        const activity = await fieldActivityOwner(db, fieldActivityId, createdBy);
        const ownerId = parseId(activity?.assigned_user_id || activity?.created_by);

        if (ownerId) {
            const owner = await getUser(db, ownerId);
            if (
                owner &&
                isSalesCapable(owner) &&
                Number(owner.branch_id) === Number(branchId) &&
                userCanHandleCategory(owner, category)
            ) {
                const load = await workload(db, owner.id);
                return {
                    assigned_to: owner.id,
                    branch_id: branchId,
                    confidence_score: scoreCandidate(owner, load, branchId, category, 25),
                    assignment_reason: "FIELD_ACTIVITY_OWNER_PRIORITY",
                    engine_version: "central_v1"
                };
            }
        }
    }

    if (payload.allow_created_by_owner !== false && createdBy) {
        const creator = await getUser(db, createdBy);
        if (
            creator &&
            isSalesCapable(creator) &&
            Number(creator.branch_id) === Number(branchId) &&
            userCanHandleCategory(creator, category)
        ) {
            const load = await workload(db, creator.id);
            if (Number(load.overdue_followups || 0) <= 10) {
                return {
                    assigned_to: creator.id,
                    branch_id: branchId,
                    confidence_score: scoreCandidate(creator, load, branchId, category, 15),
                    assignment_reason: "CREATOR_OWNERSHIP_PRIORITY",
                    engine_version: "central_v1"
                };
            }
        }
    }

    const best = await bestLoadBalancedUser(db, branchId, category);

    return {
        assigned_to: best.assigned_to,
        branch_id: branchId,
        confidence_score: best.confidence_score,
        assignment_reason: best.assignment_reason,
        engine_version: "central_v1"
    };
}

module.exports = {
    resolveAssignment,
    normalizeCategory,
    workload
};
