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

/* ===============================
   MODELS
================================ */
router.get("/models", auth, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT *
            FROM vehicle_models
            ORDER BY model_name ASC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("VEHICLE MODELS FETCH ERROR:", err);
        res.status(500).json({ message: "Failed to load vehicle models" });
    }
});

router.post("/models", auth, requireAdmin, async (req, res) => {
    try {
        const modelName = cleanText(req.body.model_name);

        if (!modelName) {
            return res.status(400).json({ message: "Model name is required" });
        }

        const result = await db.query(`
            INSERT INTO vehicle_models
            (
                brand_name,
                model_name,
                vehicle_category,
                fuel_type,
                status
            )
            VALUES ($1,$2,$3,$4,$5)
            RETURNING *
        `, [
            cleanText(req.body.brand_name || "Mahindra"),
            modelName,
            cleanText(req.body.vehicle_category),
            cleanText(req.body.fuel_type),
            cleanText(req.body.status || "ACTIVE").toUpperCase()
        ]);

        res.status(201).json({
            message: "Vehicle model created successfully",
            model: result.rows[0]
        });

    } catch (err) {
        console.error("VEHICLE MODEL CREATE ERROR:", err);
        res.status(500).json({ message: "Failed to create vehicle model" });
    }
});

router.put("/models/:id", auth, requireAdmin, async (req, res) => {
    try {
        const id = parseId(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ message: "Invalid model id" });
        }

        const result = await db.query(`
            UPDATE vehicle_models
            SET
                brand_name = $1,
                model_name = $2,
                vehicle_category = $3,
                fuel_type = $4,
                status = $5,
                updated_at = NOW()
            WHERE id = $6
            RETURNING *
        `, [
            cleanText(req.body.brand_name || "Mahindra"),
            cleanText(req.body.model_name),
            cleanText(req.body.vehicle_category),
            cleanText(req.body.fuel_type),
            cleanText(req.body.status || "ACTIVE").toUpperCase(),
            id
        ]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Vehicle model not found" });
        }

        res.json({
            message: "Vehicle model updated successfully",
            model: result.rows[0]
        });

    } catch (err) {
        console.error("VEHICLE MODEL UPDATE ERROR:", err);
        res.status(500).json({ message: "Failed to update vehicle model" });
    }
});

router.delete("/models/:id", auth, requireAdmin, async (req, res) => {
    try {
        const id = parseId(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ message: "Invalid model id" });
        }

        await db.query(`
            UPDATE vehicle_models
            SET status = 'INACTIVE', updated_at = NOW()
            WHERE id = $1
        `, [id]);

        res.json({ message: "Vehicle model deactivated" });

    } catch (err) {
        console.error("VEHICLE MODEL DELETE ERROR:", err);
        res.status(500).json({ message: "Failed to deactivate vehicle model" });
    }
});

/* ===============================
   VARIANTS
================================ */
router.get("/variants", auth, async (req, res) => {
    try {
        const values = [];
        let where = "";

        if (req.query.model_id) {
            const modelId = parseId(req.query.model_id);
            if (Number.isNaN(modelId)) {
                return res.status(400).json({ message: "Invalid model id" });
            }

            values.push(modelId);
            where = `WHERE v.model_id = $1`;
        }

        const result = await db.query(`
            SELECT
                v.*,
                m.model_name
            FROM vehicle_variants v
            LEFT JOIN vehicle_models m ON m.id = v.model_id
            ${where}
            ORDER BY m.model_name ASC, v.variant_name ASC
        `, values);

        res.json(result.rows);
    } catch (err) {
        console.error("VEHICLE VARIANTS FETCH ERROR:", err);
        res.status(500).json({ message: "Failed to load vehicle variants" });
    }
});

router.post("/variants", auth, requireAdmin, async (req, res) => {
    try {
        const modelId = parseId(req.body.model_id);

        if (Number.isNaN(modelId)) {
            return res.status(400).json({ message: "Invalid model selected" });
        }

        const variantName = cleanText(req.body.variant_name);

        if (!variantName) {
            return res.status(400).json({ message: "Variant name is required" });
        }

        const result = await db.query(`
            INSERT INTO vehicle_variants
            (
                model_id,
                variant_name,
                transmission,
                fuel_type,
                price_range,
                status
            )
            VALUES ($1,$2,$3,$4,$5,$6)
            RETURNING *
        `, [
            modelId,
            variantName,
            cleanText(req.body.transmission),
            cleanText(req.body.fuel_type),
            cleanText(req.body.price_range),
            cleanText(req.body.status || "ACTIVE").toUpperCase()
        ]);

        res.status(201).json({
            message: "Vehicle variant created successfully",
            variant: result.rows[0]
        });

    } catch (err) {
        console.error("VEHICLE VARIANT CREATE ERROR:", err);
        res.status(500).json({ message: "Failed to create vehicle variant" });
    }
});

router.put("/variants/:id", auth, requireAdmin, async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const modelId = parseId(req.body.model_id);

        if (Number.isNaN(id) || Number.isNaN(modelId)) {
            return res.status(400).json({ message: "Invalid variant or model id" });
        }

        const result = await db.query(`
            UPDATE vehicle_variants
            SET
                model_id = $1,
                variant_name = $2,
                transmission = $3,
                fuel_type = $4,
                price_range = $5,
                status = $6,
                updated_at = NOW()
            WHERE id = $7
            RETURNING *
        `, [
            modelId,
            cleanText(req.body.variant_name),
            cleanText(req.body.transmission),
            cleanText(req.body.fuel_type),
            cleanText(req.body.price_range),
            cleanText(req.body.status || "ACTIVE").toUpperCase(),
            id
        ]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Vehicle variant not found" });
        }

        res.json({
            message: "Vehicle variant updated successfully",
            variant: result.rows[0]
        });

    } catch (err) {
        console.error("VEHICLE VARIANT UPDATE ERROR:", err);
        res.status(500).json({ message: "Failed to update vehicle variant" });
    }
});

router.delete("/variants/:id", auth, requireAdmin, async (req, res) => {
    try {
        const id = parseId(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ message: "Invalid variant id" });
        }

        await db.query(`
            UPDATE vehicle_variants
            SET status = 'INACTIVE', updated_at = NOW()
            WHERE id = $1
        `, [id]);

        res.json({ message: "Vehicle variant deactivated" });

    } catch (err) {
        console.error("VEHICLE VARIANT DELETE ERROR:", err);
        res.status(500).json({ message: "Failed to deactivate vehicle variant" });
    }
});

/* ===============================
   COLORS
================================ */
router.get("/colors", auth, async (req, res) => {
    try {
        const values = [];
        let where = "";

        if (req.query.model_id) {
            const modelId = parseId(req.query.model_id);
            if (Number.isNaN(modelId)) {
                return res.status(400).json({ message: "Invalid model id" });
            }

            values.push(modelId);
            where = `WHERE c.model_id = $1`;
        }

        const result = await db.query(`
            SELECT
                c.*,
                m.model_name
            FROM vehicle_colors c
            LEFT JOIN vehicle_models m ON m.id = c.model_id
            ${where}
            ORDER BY m.model_name ASC, c.color_name ASC
        `, values);

        res.json(result.rows);
    } catch (err) {
        console.error("VEHICLE COLORS FETCH ERROR:", err);
        res.status(500).json({ message: "Failed to load vehicle colors" });
    }
});

router.post("/colors", auth, requireAdmin, async (req, res) => {
    try {
        const modelId = parseId(req.body.model_id);

        if (Number.isNaN(modelId)) {
            return res.status(400).json({ message: "Invalid model selected" });
        }

        const colorName = cleanText(req.body.color_name);

        if (!colorName) {
            return res.status(400).json({ message: "Color name is required" });
        }

        const result = await db.query(`
            INSERT INTO vehicle_colors
            (
                model_id,
                color_name,
                status
            )
            VALUES ($1,$2,$3)
            RETURNING *
        `, [
            modelId,
            colorName,
            cleanText(req.body.status || "ACTIVE").toUpperCase()
        ]);

        res.status(201).json({
            message: "Vehicle color created successfully",
            color: result.rows[0]
        });

    } catch (err) {
        console.error("VEHICLE COLOR CREATE ERROR:", err);
        res.status(500).json({ message: "Failed to create vehicle color" });
    }
});

router.put("/colors/:id", auth, requireAdmin, async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const modelId = parseId(req.body.model_id);

        if (Number.isNaN(id) || Number.isNaN(modelId)) {
            return res.status(400).json({ message: "Invalid color or model id" });
        }

        const result = await db.query(`
            UPDATE vehicle_colors
            SET
                model_id = $1,
                color_name = $2,
                status = $3
            WHERE id = $4
            RETURNING *
        `, [
            modelId,
            cleanText(req.body.color_name),
            cleanText(req.body.status || "ACTIVE").toUpperCase(),
            id
        ]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Vehicle color not found" });
        }

        res.json({
            message: "Vehicle color updated successfully",
            color: result.rows[0]
        });

    } catch (err) {
        console.error("VEHICLE COLOR UPDATE ERROR:", err);
        res.status(500).json({ message: "Failed to update vehicle color" });
    }
});

router.delete("/colors/:id", auth, requireAdmin, async (req, res) => {
    try {
        const id = parseId(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ message: "Invalid color id" });
        }

        await db.query(`
            UPDATE vehicle_colors
            SET status = 'INACTIVE'
            WHERE id = $1
        `, [id]);

        res.json({ message: "Vehicle color deactivated" });

    } catch (err) {
        console.error("VEHICLE COLOR DELETE ERROR:", err);
        res.status(500).json({ message: "Failed to deactivate vehicle color" });
    }
});

module.exports = router;