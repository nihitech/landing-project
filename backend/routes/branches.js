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

/* LIST BRANCHES */
router.get("/", auth, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                b.*,
                u.name AS manager_name
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
    try {
        const managerId = parseId(req.body.manager_id);

        if (Number.isNaN(managerId)) {
            return res.status(400).json({ message: "Invalid manager selected" });
        }

        const result = await db.query(`
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
            cleanText(req.body.phone),
            cleanText(req.body.email),
            cleanText(req.body.status || "ACTIVE").toUpperCase()
        ]);

        res.status(201).json({
            message: "Branch created successfully",
            branch: result.rows[0]
        });

    } catch (err) {
        console.error("BRANCH CREATE ERROR:", err);
        res.status(500).json({ message: "Failed to create branch" });
    }
});

/* UPDATE BRANCH */
router.put("/:id", auth, requireAdmin, async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const managerId = parseId(req.body.manager_id);

        if (!id || Number.isNaN(id)) {
            return res.status(400).json({ message: "Invalid branch id" });
        }

        if (Number.isNaN(managerId)) {
            return res.status(400).json({ message: "Invalid manager selected" });
        }

        const result = await db.query(`
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
            cleanText(req.body.phone),
            cleanText(req.body.email),
            cleanText(req.body.status || "ACTIVE").toUpperCase(),
            id
        ]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Branch not found" });
        }

        res.json({
            message: "Branch updated successfully",
            branch: result.rows[0]
        });

    } catch (err) {
        console.error("BRANCH UPDATE ERROR:", err);
        res.status(500).json({ message: "Failed to update branch" });
    }
});

/* DELETE / DEACTIVATE BRANCH */
router.delete("/:id", auth, requireAdmin, async (req, res) => {
    try {
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