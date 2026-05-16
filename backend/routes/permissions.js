const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");

let schemaReady = false;

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
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

async function ensurePermissionSchema() {
    if (schemaReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS roles (
            id BIGSERIAL PRIMARY KEY,
            role_name TEXT NOT NULL,
            role_code TEXT NOT NULL UNIQUE,
            description TEXT DEFAULT '',
            status TEXT DEFAULT 'ACTIVE',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await db.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS role_name TEXT`);
    await db.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS role_code TEXT`);
    await db.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`);
    await db.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE'`);
    await db.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
    await db.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS permissions (
            id BIGSERIAL PRIMARY KEY,
            permission_name TEXT NOT NULL,
            permission_code TEXT NOT NULL UNIQUE,
            module_name TEXT NOT NULL,
            description TEXT DEFAULT '',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await db.query(`ALTER TABLE permissions ADD COLUMN IF NOT EXISTS permission_name TEXT`);
    await db.query(`ALTER TABLE permissions ADD COLUMN IF NOT EXISTS permission_code TEXT`);
    await db.query(`ALTER TABLE permissions ADD COLUMN IF NOT EXISTS module_name TEXT`);
    await db.query(`ALTER TABLE permissions ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`);
    await db.query(`ALTER TABLE permissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS role_permissions (
            id BIGSERIAL PRIMARY KEY,
            role_id BIGINT REFERENCES roles(id) ON DELETE CASCADE,
            permission_id BIGINT REFERENCES permissions(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(role_id, permission_id)
        )
    `);

    await db.query(`
        INSERT INTO permissions (permission_name, permission_code, module_name, description)
        VALUES
            ('View Leads', 'leads.view', 'Leads', 'Can view leads'),
            ('Create Leads', 'leads.create', 'Leads', 'Can create leads'),
            ('Edit Leads', 'leads.edit', 'Leads', 'Can edit lead details'),
            ('Assign Leads', 'leads.assign', 'Leads', 'Can assign leads'),
            ('Export Leads', 'leads.export', 'Leads', 'Can export leads'),
            ('View Follow-ups', 'followups.view', 'Follow-ups', 'Can view follow-ups'),
            ('Create Follow-ups', 'followups.create', 'Follow-ups', 'Can create follow-ups'),
            ('View Reports', 'reports.view', 'Reports', 'Can view reports'),
            ('Send Reports', 'reports.send', 'Reports', 'Can send reports'),
            ('Manage Branches', 'branches.manage', 'Branches', 'Can manage branches'),
            ('Manage Departments', 'departments.manage', 'Departments', 'Can manage departments'),
            ('Manage Users', 'users.manage', 'Users', 'Can manage users'),
            ('Monitor Performance', 'performance.monitor', 'Performance', 'Can monitor team performance'),
            ('View Performance', 'performance.view', 'Performance', 'Can view performance reports'),
            ('Manage Permissions', 'permissions.manage', 'Permissions', 'Can manage roles and permissions'),
            ('Field Check-in', 'field.checkin', 'Field Activity', 'Can perform GPS check-in'),
            ('Upload Field Photos', 'field.upload_photo', 'Field Activity', 'Can upload field activity photos')
        ON CONFLICT (permission_code) DO UPDATE SET
            permission_name = EXCLUDED.permission_name,
            module_name = EXCLUDED.module_name,
            description = EXCLUDED.description
    `);

    await db.query(`
        INSERT INTO roles (role_name, role_code, description, status)
        VALUES
            ('Admin', 'admin', 'Full CRM access', 'ACTIVE'),
            ('Manager', 'manager', 'Manager monitoring access', 'ACTIVE'),
            ('Team Leader', 'team_leader', 'Team-level monitoring access', 'ACTIVE'),
            ('Sales Executive', 'sales', 'Sales user access', 'ACTIVE'),
            ('Telecaller', 'telecaller', 'Calling and follow-up access', 'ACTIVE'),
            ('Marketing', 'marketing', 'Marketing user access', 'ACTIVE'),
            ('Field Executive', 'field', 'Field activity access', 'ACTIVE'),
            ('Finance', 'finance', 'Finance user access', 'ACTIVE'),
            ('Service', 'service', 'Service user access', 'ACTIVE')
        ON CONFLICT (role_code) DO UPDATE SET
            role_name = EXCLUDED.role_name,
            description = EXCLUDED.description,
            status = EXCLUDED.status
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_roles_status ON roles(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module_name)`);

    schemaReady = true;
}

router.get("/roles", auth, requireAdmin, async (req, res) => {
    try {
        await ensurePermissionSchema();

        const result = await db.query(`
            SELECT *
            FROM roles
            ORDER BY id DESC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("ROLES LIST ERROR:", err);
        res.status(500).json({ message: err.message || "Failed to load roles" });
    }
});

router.post("/roles", auth, requireAdmin, async (req, res) => {
    try {
        await ensurePermissionSchema();

        const roleName = cleanText(req.body.role_name);
        const roleCode = cleanText(req.body.role_code).toLowerCase();

        if (!roleName || !roleCode) {
            return res.status(400).json({ message: "Role name and code are required" });
        }

        const result = await db.query(`
            INSERT INTO roles (role_name, role_code, description, status)
            VALUES ($1,$2,$3,$4)
            RETURNING *
        `, [
            roleName,
            roleCode,
            cleanText(req.body.description),
            cleanText(req.body.status || "ACTIVE").toUpperCase()
        ]);

        res.status(201).json({
            message: "Role created successfully",
            role: result.rows[0]
        });

    } catch (err) {
        console.error("ROLE CREATE ERROR:", err);

        if (err.code === "23505") {
            return res.status(400).json({ message: "Role code already exists" });
        }

        res.status(500).json({ message: err.message || "Failed to create role" });
    }
});

router.put("/roles/:id", auth, requireAdmin, async (req, res) => {
    try {
        await ensurePermissionSchema();

        const id = parseId(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ message: "Invalid role id" });
        }

        const roleName = cleanText(req.body.role_name);
        const roleCode = cleanText(req.body.role_code).toLowerCase();

        if (!roleName || !roleCode) {
            return res.status(400).json({ message: "Role name and code are required" });
        }

        const result = await db.query(`
            UPDATE roles
            SET
                role_name = $1,
                role_code = $2,
                description = $3,
                status = $4,
                updated_at = NOW()
            WHERE id = $5
            RETURNING *
        `, [
            roleName,
            roleCode,
            cleanText(req.body.description),
            cleanText(req.body.status || "ACTIVE").toUpperCase(),
            id
        ]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Role not found" });
        }

        res.json({
            message: "Role updated successfully",
            role: result.rows[0]
        });

    } catch (err) {
        console.error("ROLE UPDATE ERROR:", err);

        if (err.code === "23505") {
            return res.status(400).json({ message: "Role code already exists" });
        }

        res.status(500).json({ message: err.message || "Failed to update role" });
    }
});

router.get("/permissions", auth, requireAdmin, async (req, res) => {
    try {
        await ensurePermissionSchema();

        const result = await db.query(`
            SELECT *
            FROM permissions
            ORDER BY module_name ASC, permission_name ASC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("PERMISSIONS LIST ERROR:", err);
        res.status(500).json({ message: err.message || "Failed to load permissions" });
    }
});

router.get("/roles/:id/permissions", auth, requireAdmin, async (req, res) => {
    try {
        await ensurePermissionSchema();

        const roleId = parseId(req.params.id);

        if (Number.isNaN(roleId)) {
            return res.status(400).json({ message: "Invalid role id" });
        }

        const result = await db.query(`
            SELECT p.*
            FROM role_permissions rp
            JOIN permissions p ON p.id = rp.permission_id
            WHERE rp.role_id = $1
            ORDER BY p.module_name ASC, p.permission_name ASC
        `, [roleId]);

        res.json(result.rows);

    } catch (err) {
        console.error("ROLE PERMISSIONS FETCH ERROR:", err);
        res.status(500).json({ message: err.message || "Failed to load role permissions" });
    }
});

router.put("/roles/:id/permissions", auth, requireAdmin, async (req, res) => {
    const client = await db.connect();

    try {
        await ensurePermissionSchema();

        const roleId = parseId(req.params.id);
        const permissionIds = Array.isArray(req.body.permission_ids)
            ? req.body.permission_ids.map(Number).filter(id => Number.isInteger(id) && id > 0)
            : [];

        if (Number.isNaN(roleId)) {
            return res.status(400).json({ message: "Invalid role id" });
        }

        await client.query("BEGIN");

        await client.query(`
            DELETE FROM role_permissions
            WHERE role_id = $1
        `, [roleId]);

        for (const permissionId of permissionIds) {
            await client.query(`
                INSERT INTO role_permissions (role_id, permission_id)
                VALUES ($1,$2)
                ON CONFLICT (role_id, permission_id) DO NOTHING
            `, [roleId, permissionId]);
        }

        await client.query("COMMIT");

        res.json({ message: "Role permissions updated successfully" });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("ROLE PERMISSIONS UPDATE ERROR:", err);
        res.status(500).json({ message: err.message || "Failed to update role permissions" });

    } finally {
        client.release();
    }
});

module.exports = router;
