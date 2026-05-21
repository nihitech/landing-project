const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");
const governance = require("../services/governanceMatrix");

function clean(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function parseId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

async function ensureSchema() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS governance_approval_requests (
            id SERIAL PRIMARY KEY,
            request_type VARCHAR(80) NOT NULL,
            entity_type VARCHAR(80),
            entity_id INTEGER,
            requested_by INTEGER REFERENCES users(id),
            approved_by INTEGER REFERENCES users(id),
            request_status VARCHAR(40) DEFAULT 'PENDING',
            current_payload JSONB DEFAULT '{}'::jsonb,
            requested_payload JSONB DEFAULT '{}'::jsonb,
            reason TEXT,
            approver_remarks TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            reviewed_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_governance_approval_status ON governance_approval_requests(request_status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_governance_approval_type ON governance_approval_requests(request_type)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_governance_approval_requested_by ON governance_approval_requests(requested_by)`);
}

router.get("/matrix", auth, async (req, res) => {
    res.json(governance.GOVERNANCE_MATRIX);
});

router.get("/me", auth, async (req, res) => {
    const level = governance.authorityLevel(req.user);
    res.json({
        authority_level: level,
        data_scope: governance.dataScope(req.user),
        matrix: governance.matrixFor(level),
        can_view_vehicle_dashboard: governance.canViewVehicleDashboard(req.user),
        can_modify_vehicle_master: governance.canModifyVehicleMaster(req.user),
        can_modify_organization: governance.canModifyOrganization(req.user)
    });
});

router.get("/approval-requests", auth, async (req, res) => {
    try {
        await ensureSchema();

        const values = [];
        const clauses = ["1=1"];

        const level = governance.authorityLevel(req.user);
        const canViewApprovals = ["MANAGER", "BM", "DGM", "GM", "MD", "CEO"].includes(level);

        if (!canViewApprovals) {
            values.push(req.user.id);
            clauses.push(`r.requested_by = $${values.length}`);
        }

        if (req.query.status) {
            values.push(clean(req.query.status).toUpperCase());
            clauses.push(`r.request_status = $${values.length}`);
        }

        const result = await db.query(`
            SELECT
                r.*,
                rb.name AS requested_by_name,
                ab.name AS approved_by_name
            FROM governance_approval_requests r
            LEFT JOIN users rb ON rb.id = r.requested_by
            LEFT JOIN users ab ON ab.id = r.approved_by
            WHERE ${clauses.join(" AND ")}
            ORDER BY r.created_at DESC
            LIMIT 300
        `, values);

        res.json(result.rows);
    } catch (err) {
        console.error("GOVERNANCE APPROVAL LIST ERROR:", err);
        res.status(500).json({ message: "Failed to load governance approvals" });
    }
});

router.post("/approval-requests", auth, async (req, res) => {
    try {
        await ensureSchema();

        const requestType = clean(req.body.request_type).toUpperCase();
        if (!requestType) return res.status(400).json({ message: "Request type is required" });

        const result = await db.query(`
            INSERT INTO governance_approval_requests
            (request_type, entity_type, entity_id, requested_by, current_payload, requested_payload, reason)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING *
        `, [
            requestType,
            clean(req.body.entity_type),
            req.body.entity_id || null,
            req.user.id,
            JSON.stringify(req.body.current_payload || {}),
            JSON.stringify(req.body.requested_payload || {}),
            clean(req.body.reason)
        ]);

        res.status(201).json({
            message: "Approval request submitted",
            request: result.rows[0]
        });
    } catch (err) {
        console.error("GOVERNANCE APPROVAL CREATE ERROR:", err);
        res.status(500).json({ message: "Failed to submit approval request" });
    }
});

router.post("/approval-requests/:id/review", auth, async (req, res) => {
    try {
        await ensureSchema();

        const level = governance.authorityLevel(req.user);
        if (!["MANAGER", "BM", "DGM", "GM", "MD", "CEO"].includes(level)) {
            return res.status(403).json({ message: "You do not have approval authority" });
        }

        const id = parseId(req.params.id);
        if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid request id" });

        const status = clean(req.body.request_status).toUpperCase();
        if (!["APPROVED", "REJECTED"].includes(status)) {
            return res.status(400).json({ message: "Status must be APPROVED or REJECTED" });
        }

        const result = await db.query(`
            UPDATE governance_approval_requests
            SET request_status=$1,
                approved_by=$2,
                approver_remarks=$3,
                reviewed_at=NOW(),
                updated_at=NOW()
            WHERE id=$4
            AND request_status='PENDING'
            RETURNING *
        `, [
            status,
            req.user.id,
            clean(req.body.approver_remarks),
            id
        ]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Pending request not found" });
        }

        res.json({
            message: `Request ${status.toLowerCase()}`,
            request: result.rows[0]
        });

    } catch (err) {
        console.error("GOVERNANCE APPROVAL REVIEW ERROR:", err);
        res.status(500).json({ message: "Failed to review approval request" });
    }
});

module.exports = router;
