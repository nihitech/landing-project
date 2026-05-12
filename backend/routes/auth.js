const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const auth = require("../middleware/auth");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

function cleanText(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function cleanPhone(phone) {
    return String(phone || "").replace(/\D/g, "").slice(-10);
}

function normalizeRole(role) {
    const value = String(role || "sales").trim().toLowerCase();

    const allowed = [
        "admin",
        "sales",
        "manager",
        "telecaller",
        "marketing",
        "field",
        "finance",
        "service",
        "view_only"
    ];

    return allowed.includes(value) ? value : "sales";
}

function normalizeScope(scope, role) {
    const value = String(scope || "").trim().toUpperCase();

    const allowed = [
        "ALL",
        "BRANCH",
        "DEPARTMENT",
        "TEAM",
        "OWN",
        "VIEW_ONLY"
    ];

    if (allowed.includes(value)) return value;

    return role === "admin" ? "ALL" : "OWN";
}

function parseId(value) {
    if (value === "" || value === null || value === undefined) return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

function isAdminUser(user) {
    return String(user?.role || "").toLowerCase() === "admin";
}

function requireAdmin(req, res, next) {
    if (!isAdminUser(req.user)) {
        return res.status(403).json({ message: "Admin access required" });
    }

    next();
}

async function optionalAdminForRegister(req, res, next) {
    try {
        const count = await db.query("SELECT COUNT(*)::int AS count FROM users");
        const hasUsers = count.rows[0].count > 0;

        // First user can be created without login. Force admin.
        if (!hasUsers) {
            req.firstUser = true;
            return next();
        }

        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : header;

        if (!token) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        req.user = jwt.verify(token, JWT_SECRET);

        if (!isAdminUser(req.user)) {
            return res.status(403).json({ message: "Admin access required" });
        }

        next();

    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}

async function getDefaultDepartmentId(role) {
    const code = role === "admin" ? "ADMIN" : "SALES";

    const result = await db.query(
        "SELECT id FROM departments WHERE code=$1 LIMIT 1",
        [code]
    );

    return result.rows[0]?.id || null;
}

async function getDefaultBranchId() {
    const result = await db.query(
        "SELECT id FROM branches WHERE branch_code='MAIN' LIMIT 1"
    );

    return result.rows[0]?.id || null;
}

async function getUserPermissions(userId) {
    const result = await db.query(`
        SELECT permission_key
        FROM user_permissions
        WHERE user_id = $1
        AND allowed = true
        ORDER BY permission_key
    `, [userId]);

    return result.rows.map(row => row.permission_key);
}

async function buildSafeUser(userRow) {
    const permissions = await getUserPermissions(userRow.id);

    return {
        id: userRow.id,
        user_code: userRow.user_code || "",
        name: userRow.name,
        email: userRow.email,
        phone: userRow.phone || "",
        role: userRow.role,

        department_id: userRow.department_id || null,
        department_name: userRow.department_name || "",
        department_code: userRow.department_code || "",

        branch_id: userRow.branch_id || null,
        branch_name: userRow.branch_name || "",
        branch_code: userRow.branch_code || "",

        designation: userRow.designation || "",
        manager_id: userRow.manager_id || null,
        manager_name: userRow.manager_name || "",

        data_scope: userRow.data_scope || "OWN",

        can_view: userRow.can_view !== false,
        can_create: userRow.can_create === true,
        can_edit: userRow.can_edit === true,
        can_assign: userRow.can_assign === true,
        can_delete: userRow.can_delete === true,
        can_export: userRow.can_export === true,
        can_monitor: userRow.can_monitor === true,

        status: userRow.status || "ACTIVE",
        permissions
    };
}

async function getFullUserById(userId) {
    const result = await db.query(`
        SELECT 
            u.id,
            u.user_code,
            u.name,
            u.email,
            u.phone,
            u.role,
            u.department_id,
            d.name AS department_name,
            d.code AS department_code,
            u.branch_id,
            b.branch_name,
            b.branch_code,
            u.designation,
            u.manager_id,
            m.name AS manager_name,
            u.data_scope,
            u.can_view,
            u.can_create,
            u.can_edit,
            u.can_assign,
            u.can_delete,
            u.can_export,
            u.can_monitor,
            u.status,
            u.created_at,
            u.last_login_at
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN branches b ON u.branch_id = b.id
        LEFT JOIN users m ON u.manager_id = m.id
        WHERE u.id = $1
        LIMIT 1
    `, [userId]);

    if (!result.rows.length) return null;

    return buildSafeUser(result.rows[0]);
}

/* =====================================================
   REGISTER USER
===================================================== */
router.post("/register", optionalAdminForRegister, async (req, res) => {
    try {
        const cleanName = cleanText(req.body.name);
        const cleanEmail = cleanText(req.body.email).toLowerCase();
        const password = String(req.body.password || "");

        const role = req.firstUser
            ? "admin"
            : normalizeRole(req.body.role);

        if (!cleanName || !cleanEmail || !password) {
            return res.status(400).json({
                message: "Name, email and password are required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters"
            });
        }

        const existing = await db.query(
            "SELECT id FROM users WHERE LOWER(email)=LOWER($1)",
            [cleanEmail]
        );

        if (existing.rows.length) {
            return res.status(409).json({
                message: "User already exists"
            });
        }

        const requestedDepartmentId = parseId(req.body.department_id);
        const requestedBranchId = parseId(req.body.branch_id);
        const requestedManagerId = parseId(req.body.manager_id);

        if (
            Number.isNaN(requestedDepartmentId) ||
            Number.isNaN(requestedBranchId) ||
            Number.isNaN(requestedManagerId)
        ) {
            return res.status(400).json({
                message: "Invalid department, branch or manager selected"
            });
        }

        const departmentId = requestedDepartmentId || await getDefaultDepartmentId(role);
        const branchId = requestedBranchId || await getDefaultBranchId();

        const dataScope = req.firstUser
            ? "ALL"
            : normalizeScope(req.body.data_scope, role);

        const defaultAdmin = role === "admin";

        const canView = req.body.can_view !== undefined
            ? req.body.can_view === true
            : true;

        const canCreate = req.body.can_create !== undefined
            ? req.body.can_create === true
            : defaultAdmin;

        const canEdit = req.body.can_edit !== undefined
            ? req.body.can_edit === true
            : defaultAdmin || role === "sales";

        const canAssign = req.body.can_assign !== undefined
            ? req.body.can_assign === true
            : defaultAdmin;

        const canDelete = req.body.can_delete !== undefined
            ? req.body.can_delete === true
            : defaultAdmin;

        const canExport = req.body.can_export !== undefined
            ? req.body.can_export === true
            : defaultAdmin;

        const canMonitor = req.body.can_monitor !== undefined
            ? req.body.can_monitor === true
            : defaultAdmin;

        const hash = await bcrypt.hash(password, 10);

        const result = await db.query(`
            INSERT INTO users (
                user_code,
                name,
                email,
                password,
                role,
                phone,
                department_id,
                branch_id,
                designation,
                manager_id,
                data_scope,
                can_view,
                can_create,
                can_edit,
                can_assign,
                can_delete,
                can_export,
                can_monitor,
                status
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17,$18,$19
            )
            RETURNING id
        `, [
            cleanText(req.body.user_code),
            cleanName,
            cleanEmail,
            hash,
            role,
            cleanPhone(req.body.phone),
            departmentId,
            branchId,
            cleanText(req.body.designation),
            requestedManagerId,
            dataScope,
            canView,
            canCreate,
            canEdit,
            canAssign,
            canDelete,
            canExport,
            canMonitor,
            "ACTIVE"
        ]);

        const userId = result.rows[0].id;

        // Default permission assignment.
        if (role === "admin") {
            await db.query(`
                INSERT INTO user_permissions (user_id, permission_key, allowed)
                SELECT $1, permission_key, true
                FROM permission_master
                ON CONFLICT (user_id, permission_key)
                DO UPDATE SET allowed = EXCLUDED.allowed
            `, [userId]);
        } else {
            await db.query(`
                INSERT INTO user_permissions (user_id, permission_key, allowed)
                SELECT $1, permission_key, true
                FROM permission_master
                WHERE permission_key IN (
                    'leads.view',
                    'leads.create',
                    'leads.edit',
                    'followups.create',
                    'followups.view',
                    'campaigns.view',
                    'field.checkin',
                    'field.upload_photo'
                )
                ON CONFLICT (user_id, permission_key)
                DO UPDATE SET allowed = EXCLUDED.allowed
            `, [userId]);
        }

        const safeUser = await getFullUserById(userId);

        res.status(201).json({
            message: "User created successfully",
            user: safeUser
        });

    } catch (err) {
        console.error("REGISTER ERROR:", err);
        res.status(500).json({
            message: "Register failed"
        });
    }
});

/* =====================================================
   LOGIN
===================================================== */
router.post("/login", async (req, res) => {
    try {
        const email = cleanText(req.body.email).toLowerCase();
        const password = String(req.body.password || "");

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password required"
            });
        }

        const result = await db.query(`
            SELECT 
                u.id,
                u.user_code,
                u.name,
                u.email,
                u.password,
                u.phone,
                u.role,
                u.department_id,
                d.name AS department_name,
                d.code AS department_code,
                u.branch_id,
                b.branch_name,
                b.branch_code,
                u.designation,
                u.manager_id,
                m.name AS manager_name,
                u.data_scope,
                u.can_view,
                u.can_create,
                u.can_edit,
                u.can_assign,
                u.can_delete,
                u.can_export,
                u.can_monitor,
                u.status,
                u.created_at,
                u.last_login_at
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN branches b ON u.branch_id = b.id
            LEFT JOIN users m ON u.manager_id = m.id
            WHERE LOWER(u.email) = LOWER($1)
            LIMIT 1
        `, [email]);

        const user = result.rows[0];

        if (!user) {
            return res.status(400).json({
                message: "Invalid email or password"
            });
        }

        if (String(user.status || "ACTIVE").toUpperCase() !== "ACTIVE") {
            return res.status(403).json({
                message: "Your account is inactive. Please contact admin."
            });
        }

        const valid = await bcrypt.compare(password, user.password);

        if (!valid) {
            return res.status(400).json({
                message: "Invalid email or password"
            });
        }

        const safeUser = await buildSafeUser(user);

        await db.query(
            "UPDATE users SET last_login_at=NOW() WHERE id=$1",
            [safeUser.id]
        );

        const token = jwt.sign(safeUser, JWT_SECRET, {
            expiresIn: "12h"
        });

        res.json({
            token,
            user: safeUser
        });

    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({
            message: "Login failed"
        });
    }
});

/* =====================================================
   MY PROFILE
===================================================== */
router.get("/me", auth, async (req, res) => {
    try {
        const safeUser = await getFullUserById(req.user.id);

        if (!safeUser) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.json(safeUser);

    } catch (err) {
        console.error("ME ERROR:", err);
        res.status(500).json({
            message: "Failed to load profile"
        });
    }
});

/* =====================================================
   LIST USERS
===================================================== */
router.get("/users", auth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                u.id,
                u.user_code,
                u.name,
                u.email,
                u.phone,
                u.role,
                u.department_id,
                d.name AS department_name,
                d.code AS department_code,
                u.branch_id,
                b.branch_name,
                b.branch_code,
                u.designation,
                u.manager_id,
                m.name AS manager_name,
                u.data_scope,
                u.can_view,
                u.can_create,
                u.can_edit,
                u.can_assign,
                u.can_delete,
                u.can_export,
                u.can_monitor,
                u.status,
                u.created_at,
                u.last_login_at
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN branches b ON u.branch_id = b.id
            LEFT JOIN users m ON u.manager_id = m.id
            ORDER BY 
                CASE 
                    WHEN LOWER(u.role) = 'admin' THEN 1
                    WHEN LOWER(u.role) = 'manager' THEN 2
                    WHEN LOWER(u.role) = 'sales' THEN 3
                    ELSE 4
                END,
                u.name ASC
        `);

        res.json(result.rows);

    } catch (err) {
        console.error("USERS FETCH ERROR:", err);
        res.status(500).json({
            message: "Failed to fetch users"
        });
    }
});

/* =====================================================
   UPDATE USER
===================================================== */
router.put("/user/:id", auth, requireAdmin, async (req, res) => {
    try {
        const userId = parseId(req.params.id);

        if (!userId) {
            return res.status(400).json({
                message: "Invalid user"
            });
        }

        const role = normalizeRole(req.body.role);
        const departmentId = parseId(req.body.department_id);
        const branchId = parseId(req.body.branch_id);
        const managerId = parseId(req.body.manager_id);

        if (
            Number.isNaN(departmentId) ||
            Number.isNaN(branchId) ||
            Number.isNaN(managerId)
        ) {
            return res.status(400).json({
                message: "Invalid department, branch or manager selected"
            });
        }

        const result = await db.query(`
            UPDATE users
            SET
                user_code = $1,
                name = $2,
                phone = $3,
                role = $4,
                department_id = $5,
                branch_id = $6,
                designation = $7,
                manager_id = $8,
                data_scope = $9,
                can_view = $10,
                can_create = $11,
                can_edit = $12,
                can_assign = $13,
                can_delete = $14,
                can_export = $15,
                can_monitor = $16,
                status = $17,
                updated_at = NOW()
            WHERE id = $18
            RETURNING id
        `, [
            cleanText(req.body.user_code),
            cleanText(req.body.name),
            cleanPhone(req.body.phone),
            role,
            departmentId,
            branchId,
            cleanText(req.body.designation),
            managerId,
            normalizeScope(req.body.data_scope, role),
            req.body.can_view !== false,
            req.body.can_create === true,
            req.body.can_edit === true,
            req.body.can_assign === true,
            req.body.can_delete === true,
            req.body.can_export === true,
            req.body.can_monitor === true,
            String(req.body.status || "ACTIVE").toUpperCase(),
            userId
        ]);

        if (!result.rows.length) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const safeUser = await getFullUserById(userId);

        res.json({
            message: "User updated successfully",
            user: safeUser
        });

    } catch (err) {
        console.error("USER UPDATE ERROR:", err);
        res.status(500).json({
            message: "User update failed"
        });
    }
});

/* =====================================================
   DELETE USER
===================================================== */
router.delete("/user/:id", auth, requireAdmin, async (req, res) => {
    try {
        const id = parseId(req.params.id);

        if (!id) {
            return res.status(400).json({
                message: "Invalid user"
            });
        }

        if (id === Number(req.user.id)) {
            return res.status(400).json({
                message: "You cannot delete your own account"
            });
        }

        await db.query("UPDATE leads SET assigned_to=NULL WHERE assigned_to=$1", [id]);
        await db.query("UPDATE branches SET manager_id=NULL WHERE manager_id=$1", [id]);
        await db.query("UPDATE users SET manager_id=NULL WHERE manager_id=$1", [id]);
        await db.query("DELETE FROM user_permissions WHERE user_id=$1", [id]);
        await db.query("DELETE FROM users WHERE id=$1", [id]);

        res.json({
            message: "User deleted and assigned leads moved to unassigned"
        });

    } catch (err) {
        console.error("DELETE USER ERROR:", err);
        res.status(500).json({
            message: "Delete failed"
        });
    }
});
/* =====================================================
   DEPARTMENTS LIST
===================================================== */
router.get("/departments", auth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, name, code, description, status
            FROM departments
            WHERE status = 'ACTIVE'
            ORDER BY name ASC
        `);

        res.json(result.rows);

    } catch (err) {
        console.error("DEPARTMENTS FETCH ERROR:", err);
        res.status(500).json({
            message: "Failed to fetch departments"
        });
    }
});

/* =====================================================
   BRANCHES LIST
===================================================== */
router.get("/branches", auth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                id,
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
                status
            FROM branches
            WHERE status = 'ACTIVE'
            ORDER BY branch_name ASC
        `);

        res.json(result.rows);

    } catch (err) {
        console.error("BRANCHES FETCH ERROR:", err);
        res.status(500).json({
            message: "Failed to fetch branches"
        });
    }
});
module.exports = router;