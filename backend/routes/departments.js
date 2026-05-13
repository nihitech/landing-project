const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");

let schemaReady = false;

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
}

function requireAdmin(req, res, next) {
    if (normalizeRole(req.user?.role) !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
    }

    next();
}

function cleanText(value) {
    return String(value ?? "").trim();
}

function parseId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

async function ensureDepartmentSchema() {
    if (schemaReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS departments (
            id BIGSERIAL PRIMARY KEY,
            name TEXT,
            code TEXT,
            description TEXT DEFAULT '',
            status TEXT DEFAULT 'ACTIVE',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await db.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS name TEXT`);
    await db.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS code TEXT`);
    await db.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS department_name TEXT`);
    await db.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS department_code TEXT`);
    await db.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`);
    await db.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE'`);
    await db.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
    await db.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);

    await db.query(`
        UPDATE departments
        SET
            name = COALESCE(NULLIF(name, ''), department_name),
            code = COALESCE(NULLIF(code, ''), department_code),
            department_name = COALESCE(NULLIF(department_name, ''), name),
            department_code = COALESCE(NULLIF(department_code, ''), code),
            status = COALESCE(NULLIF(status, ''), 'ACTIVE')
    `);

    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_code_unique ON departments (LOWER(code)) WHERE code IS NOT NULL AND code <> ''`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status)`);

    await db.query(`
        INSERT INTO departments (name, code, department_name, department_code, description, status)
        VALUES
            ('Admin', 'ADMIN', 'Admin', 'ADMIN', 'Administration department', 'ACTIVE'),
            ('Sales', 'SALES', 'Sales', 'SALES', 'Sales department', 'ACTIVE'),
            ('Marketing', 'MARKETING', 'Marketing', 'MARKETING', 'Marketing department', 'ACTIVE'),
            ('Service', 'SERVICE', 'Service', 'SERVICE', 'Service department', 'ACTIVE'),
            ('Accessories', 'ACCESSORIES', 'Accessories', 'ACCESSORIES', 'Accessories department', 'ACTIVE'),
            ('Finance', 'FINANCE', 'Finance', 'FINANCE', 'Finance department', 'ACTIVE'),
            ('Insurance', 'INSURANCE', 'Insurance', 'INSURANCE', 'Insurance department', 'ACTIVE'),
            ('Field Team', 'FIELD', 'Field Team', 'FIELD', 'Field activity department', 'ACTIVE')
        ON CONFLICT DO NOTHING
    `);

    schemaReady = true;
}

/* LIST DEPARTMENTS */
router.get("/", auth, async (req, res) => {
    try {
        await ensureDepartmentSchema();

        const result = await db.query(`
            SELECT
                id,
                COALESCE(NULLIF(department_name, ''), name, '') AS department_name,
                COALESCE(NULLIF(department_code, ''), code, '') AS department_code,
                COALESCE(description, '') AS description,
                COALESCE(status, 'ACTIVE') AS status,
                created_at,
                updated_at
            FROM departments
            ORDER BY id DESC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("DEPARTMENT LIST ERROR:", err);
        res.status(500).json({ message: err.message || "Failed to load departments" });
    }
});

/* CREATE DEPARTMENT */
router.post("/", auth, requireAdmin, async (req, res) => {
    try {
        await ensureDepartmentSchema();

        const departmentName = cleanText(req.body.department_name || req.body.name);
        const departmentCode = cleanText(req.body.department_code || req.body.code).toUpperCase();

        if (!departmentName || !departmentCode) {
            return res.status(400).json({
                message: "Department name and code are required"
            });
        }

        const duplicate = await db.query(`
            SELECT id
            FROM departments
            WHERE LOWER(COALESCE(code, department_code)) = LOWER($1)
            LIMIT 1
        `, [departmentCode]);

        if (duplicate.rows.length) {
            return res.status(400).json({ message: "Department code already exists" });
        }

        const result = await db.query(`
            INSERT INTO departments
            (
                name,
                code,
                department_name,
                department_code,
                description,
                status
            )
            VALUES ($1,$2,$1,$2,$3,$4)
            RETURNING
                id,
                department_name,
                department_code,
                description,
                status,
                created_at,
                updated_at
        `, [
            departmentName,
            departmentCode,
            cleanText(req.body.description),
            cleanText(req.body.status || "ACTIVE").toUpperCase()
        ]);

        res.status(201).json({
            message: "Department created successfully",
            department: result.rows[0]
        });

    } catch (err) {
        console.error("DEPARTMENT CREATE ERROR:", err);
        res.status(500).json({ message: err.message || "Failed to create department" });
    }
});

/* UPDATE DEPARTMENT */
router.put("/:id", auth, requireAdmin, async (req, res) => {
    try {
        await ensureDepartmentSchema();

        const id = parseId(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ message: "Invalid department id" });
        }

        const departmentName = cleanText(req.body.department_name || req.body.name);
        const departmentCode = cleanText(req.body.department_code || req.body.code).toUpperCase();

        if (!departmentName || !departmentCode) {
            return res.status(400).json({
                message: "Department name and code are required"
            });
        }

        const duplicate = await db.query(`
            SELECT id
            FROM departments
            WHERE LOWER(COALESCE(code, department_code)) = LOWER($1)
            AND id <> $2
            LIMIT 1
        `, [departmentCode, id]);

        if (duplicate.rows.length) {
            return res.status(400).json({ message: "Department code already exists" });
        }

        const result = await db.query(`
            UPDATE departments
            SET
                name = $1,
                code = $2,
                department_name = $1,
                department_code = $2,
                description = $3,
                status = $4,
                updated_at = NOW()
            WHERE id = $5
            RETURNING
                id,
                department_name,
                department_code,
                description,
                status,
                created_at,
                updated_at
        `, [
            departmentName,
            departmentCode,
            cleanText(req.body.description),
            cleanText(req.body.status || "ACTIVE").toUpperCase(),
            id
        ]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Department not found" });
        }

        res.json({
            message: "Department updated successfully",
            department: result.rows[0]
        });

    } catch (err) {
        console.error("DEPARTMENT UPDATE ERROR:", err);
        res.status(500).json({ message: err.message || "Failed to update department" });
    }
});

/* DEACTIVATE DEPARTMENT */
router.delete("/:id", auth, requireAdmin, async (req, res) => {
    try {
        await ensureDepartmentSchema();

        const id = parseId(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ message: "Invalid department id" });
        }

        const result = await db.query(`
            UPDATE departments
            SET status = 'INACTIVE', updated_at = NOW()
            WHERE id = $1
            RETURNING id
        `, [id]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Department not found" });
        }

        res.json({ message: "Department deactivated successfully" });

    } catch (err) {
        console.error("DEPARTMENT DELETE ERROR:", err);
        res.status(500).json({ message: err.message || "Failed to deactivate department" });
    }
});

module.exports = router;
