const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
}

function requireAdmin(req, res, next) {
    if (!["admin", "super_admin", "owner", "director", "ceo"].includes(normalizeRole(req.user?.role))) {
        return res.status(403).json({ message: "Admin access required" });
    }
    next();
}

function cleanText(value) {
    return String(value ?? "").trim();
}

function parseId(value) {
    if (value === "" || value === null || value === undefined) return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

async function getManagerDetails(client, managerId) {
    if (!managerId) return null;

    const result = await client.query(`
        SELECT id, name, phone, mobile, email, role, status
        FROM users
        WHERE id = $1
        LIMIT 1
    `, [managerId]);

    return result.rows[0] || null;
}

function managerPhone(manager) {
    return cleanText(manager?.phone || manager?.mobile || "");
}


async function ensureBranchManagementColumns() {
    try {
        await db.query(`
            ALTER TABLE branches
            ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id),
            ADD COLUMN IF NOT EXISTS phone TEXT,
            ADD COLUMN IF NOT EXISTS email TEXT,
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE',
            ADD COLUMN IF NOT EXISTS address TEXT,
            ADD COLUMN IF NOT EXISTS area TEXT,
            ADD COLUMN IF NOT EXISTS city TEXT,
            ADD COLUMN IF NOT EXISTS district TEXT,
            ADD COLUMN IF NOT EXISTS state TEXT,
            ADD COLUMN IF NOT EXISTS pincode TEXT,
            ADD COLUMN IF NOT EXISTS latitude NUMERIC(12,8),
            ADD COLUMN IF NOT EXISTS longitude NUMERIC(12,8),
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()
        `);
        await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id)`);
        await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
    } catch (err) {
        console.error("ENSURE BRANCH MANAGEMENT COLUMNS ERROR:", err.message);
    }
}

/* LIST BRANCHES */
router.get("/", auth, async (req, res) => {
    try {
        await ensureBranchManagementColumns();
        const result = await db.query(`
            SELECT
                b.*,
                u.name AS manager_name,
                u.email AS manager_email,
                COALESCE(u.phone, u.mobile) AS manager_phone,
                u.role AS manager_role,
                u.branch_id AS manager_current_branch_id
            FROM branches b
            LEFT JOIN users u ON b.manager_id = u.id
            ORDER BY b.id DESC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("BRANCH LIST ERROR:", err);
        res.status(500).json({ message: "Failed to load branches" });
    }
});

/* CREATE BRANCH */
router.post("/", auth, requireAdmin, async (req, res) => {
    const client = await db.connect();

    try {
        await ensureBranchManagementColumns();
        await client.query("BEGIN");

        const managerId = parseId(req.body.manager_id);

        if (Number.isNaN(managerId)) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Invalid manager selected" });
        }

        const manager = await getManagerDetails(client, managerId);

        const branchPhone = cleanText(req.body.phone) || managerPhone(manager);
        const branchEmail = cleanText(req.body.email) || cleanText(manager?.email);

        const result = await client.query(`
            INSERT INTO branches
            (
                branch_name,
                branch_code,
                address,
                area,
                city,
                district,
                state,
                pincode,
                latitude,
                longitude,
                manager_id,
                phone,
                email,
                status
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            RETURNING *
        `, [
            cleanText(req.body.branch_name),
            cleanText(req.body.branch_code).toUpperCase(),
            cleanText(req.body.address),
            cleanText(req.body.area),
            cleanText(req.body.city),
            cleanText(req.body.district),
            cleanText(req.body.state),
            cleanText(req.body.pincode),
            req.body.latitude || null,
            req.body.longitude || null,
            managerId,
            branchPhone,
            branchEmail,
            cleanText(req.body.status || "ACTIVE").toUpperCase()
        ]);

        const branch = result.rows[0];

        if (managerId) {
            await client.query(`
                UPDATE users
                SET
                    branch_id = $1,
                    role = CASE
                        WHEN LOWER(COALESCE(role, '')) IN ('admin','super_admin','owner','director','ceo')
                        THEN role
                        ELSE COALESCE(NULLIF(role, ''), 'branch_manager')
                    END,
                    updated_at = NOW()
                WHERE id = $2
            `, [branch.id, managerId]);
        }

        await client.query("COMMIT");

        res.status(201).json({
            message: "Branch created successfully and manager assigned to this branch",
            branch
        });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("BRANCH CREATE ERROR:", err);
        res.status(500).json({ message: "Failed to create branch" });
    } finally {
        client.release();
    }
});

/* UPDATE BRANCH */
router.put("/:id", auth, requireAdmin, async (req, res) => {
    const client = await db.connect();

    try {
        await ensureBranchManagementColumns();
        await client.query("BEGIN");

        const id = parseId(req.params.id);
        const managerId = parseId(req.body.manager_id);

        if (!id || Number.isNaN(id)) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Invalid branch id" });
        }

        if (Number.isNaN(managerId)) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Invalid manager selected" });
        }

        const manager = await getManagerDetails(client, managerId);

        const branchPhone = cleanText(req.body.phone) || managerPhone(manager);
        const branchEmail = cleanText(req.body.email) || cleanText(manager?.email);

        const result = await client.query(`
            UPDATE branches
            SET
                branch_name = $1,
                branch_code = $2,
                address = $3,
                area = $4,
                city = $5,
                district = $6,
                state = $7,
                pincode = $8,
                latitude = $9,
                longitude = $10,
                manager_id = $11,
                phone = $12,
                email = $13,
                status = $14,
                updated_at = NOW()
            WHERE id = $15
            RETURNING *
        `, [
            cleanText(req.body.branch_name),
            cleanText(req.body.branch_code).toUpperCase(),
            cleanText(req.body.address),
            cleanText(req.body.area),
            cleanText(req.body.city),
            cleanText(req.body.district),
            cleanText(req.body.state),
            cleanText(req.body.pincode),
            req.body.latitude || null,
            req.body.longitude || null,
            managerId,
            branchPhone,
            branchEmail,
            cleanText(req.body.status || "ACTIVE").toUpperCase(),
            id
        ]);

        if (!result.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Branch not found" });
        }

        if (managerId) {
            await client.query(`
                UPDATE users
                SET
                    branch_id = $1,
                    role = CASE
                        WHEN LOWER(COALESCE(role, '')) IN ('admin','super_admin','owner','director','ceo')
                        THEN role
                        ELSE COALESCE(NULLIF(role, ''), 'branch_manager')
                    END,
                    updated_at = NOW()
                WHERE id = $2
            `, [id, managerId]);
        }

        await client.query("COMMIT");

        res.json({
            message: "Branch updated successfully and manager branch assignment synced",
            branch: result.rows[0]
        });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("BRANCH UPDATE ERROR:", err);
        res.status(500).json({ message: "Failed to update branch" });
    } finally {
        client.release();
    }
});

/* DELETE / DEACTIVATE BRANCH */
router.delete("/:id", auth, requireAdmin, async (req, res) => {
    try {
        await ensureBranchManagementColumns();
        const id = parseId(req.params.id);

        if (!id || Number.isNaN(id)) {
            return res.status(400).json({ message: "Invalid branch id" });
        }

        const result = await db.query(`
            UPDATE branches
            SET status = 'INACTIVE', updated_at = NOW()
            WHERE id = $1
            RETURNING id
        `, [id]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Branch not found" });
        }

        res.json({ message: "Branch deactivated successfully" });

    } catch (err) {
        console.error("BRANCH DELETE ERROR:", err);
        res.status(500).json({ message: "Failed to deactivate branch" });
    }
});

module.exports = router;
