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

function cleanText(value) {
    return String(value ?? "").trim();
}

function parseId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

router.get("/roles", auth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT *
            FROM roles
            ORDER BY id DESC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("ROLES LIST ERROR:", err);
        res.status(500).json({ message: "Failed to load roles" });
    }
});

router.post("/roles", auth, requireAdmin, async (req, res) => {
    try {
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

        res.status(500).json({ message: "Failed to create role" });
    }
});

router.put("/roles/:id", auth, requireAdmin, async (req, res) => {
    try {
        const id = parseId(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ message: "Invalid role id" });
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
            cleanText(req.body.role_name),
            cleanText(req.body.role_code).toLowerCase(),
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

        res.status(500).json({ message: "Failed to update role" });
    }
});

router.get("/permissions", auth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT *
            FROM permissions
            ORDER BY module_name ASC, permission_name ASC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("PERMISSIONS LIST ERROR:", err);
        res.status(500).json({ message: "Failed to load permissions" });
    }
});

router.get("/roles/:id/permissions", auth, requireAdmin, async (req, res) => {
    try {
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
        res.status(500).json({ message: "Failed to load role permissions" });
    }
});

router.put("/roles/:id/permissions", auth, requireAdmin, async (req, res) => {
    const client = await db.connect();

    try {
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
        res.status(500).json({ message: "Failed to update role permissions" });

    } finally {
        client.release();
    }
});

module.exports = router;