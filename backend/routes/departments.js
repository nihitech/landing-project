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

/* LIST DEPARTMENTS */
router.get("/", auth, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT *
            FROM departments
            ORDER BY id DESC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("DEPARTMENT LIST ERROR:", err);
        res.status(500).json({ message: "Failed to load departments" });
    }
});

/* CREATE DEPARTMENT */
router.post("/", auth, requireAdmin, async (req, res) => {
    try {
        const departmentName = cleanText(req.body.department_name);
        const departmentCode = cleanText(req.body.department_code).toUpperCase();

        if (!departmentName || !departmentCode) {
            return res.status(400).json({
                message: "Department name and code are required"
            });
        }

        const result = await db.query(`
            INSERT INTO departments
            (
                department_name,
                department_code,
                description,
                status
            )
            VALUES ($1,$2,$3,$4)
            RETURNING *
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

        if (err.code === "23505") {
            return res.status(400).json({
                message: "Department code already exists"
            });
        }

        res.status(500).json({ message: "Failed to create department" });
    }
});

/* UPDATE DEPARTMENT */
router.put("/:id", auth, requireAdmin, async (req, res) => {
    try {
        const id = parseId(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ message: "Invalid department id" });
        }

        const departmentName = cleanText(req.body.department_name);
        const departmentCode = cleanText(req.body.department_code).toUpperCase();

        if (!departmentName || !departmentCode) {
            return res.status(400).json({
                message: "Department name and code are required"
            });
        }

        const result = await db.query(`
            UPDATE departments
            SET
                department_name = $1,
                department_code = $2,
                description = $3,
                status = $4,
                updated_at = NOW()
            WHERE id = $5
            RETURNING *
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

        if (err.code === "23505") {
            return res.status(400).json({
                message: "Department code already exists"
            });
        }

        res.status(500).json({ message: "Failed to update department" });
    }
});

/* DEACTIVATE DEPARTMENT */
router.delete("/:id", auth, requireAdmin, async (req, res) => {
    try {
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
        res.status(500).json({ message: "Failed to deactivate department" });
    }
});

module.exports = router;