const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
}

function isAdminUser(req) {
    return ["admin", "super_admin", "owner", "director", "ceo"].includes(normalizeRole(req.user?.role));
}

function normalizeVehicleCategoryScope(value) {
    const scope = String(value || "ALL").trim().toUpperCase();
    return ["ALL", "AD", "EV"].includes(scope) ? scope : "ALL";
}

function canManageVehicles(req) {
    if (isAdminUser(req)) return true;

    const role = normalizeRole(req.user?.role);
    const managerRoles = ["manager", "branch_manager", "team_leader"];

    return managerRoles.includes(role) || req.user?.can_edit === true || req.user?.can_create === true;
}

function requireVehicleManage(req, res, next) {
    if (!canManageVehicles(req)) {
        return res.status(403).json({ message: "You do not have permission to manage vehicles" });
    }

    next();
}

function appendVehicleCategoryScope(req, clauses, values, alias = "m") {
    if (isAdminUser(req)) return;

    const categoryScope = normalizeVehicleCategoryScope(req.user?.vehicle_category_scope);

    if (categoryScope === "ALL") return;

    values.push(categoryScope);
    clauses.push(`UPPER(COALESCE(${alias}.vehicle_category, '')) = $${values.length}`);
}

function requestedCategoryAllowed(req, category) {
    if (isAdminUser(req)) return true;

    const categoryScope = normalizeVehicleCategoryScope(req.user?.vehicle_category_scope);
    if (categoryScope === "ALL") return true;

    return normalizeVehicleCategoryScope(category) === categoryScope;
}

async function ensureModelAllowedForUser(req, modelId) {
    if (isAdminUser(req)) return true;

    const categoryScope = normalizeVehicleCategoryScope(req.user?.vehicle_category_scope);
    if (categoryScope === "ALL") return true;

    const result = await db.query(`
        SELECT id
        FROM vehicle_models
        WHERE id = $1
        AND UPPER(COALESCE(vehicle_category, '')) = $2
        LIMIT 1
    `, [modelId, categoryScope]);

    return result.rows.length > 0;
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
        const clauses = [];
        const values = [];

        if (req.query.vehicle_category) {
            const category = normalizeVehicleCategoryScope(req.query.vehicle_category);
            if (category !== "ALL") {
                values.push(category);
                clauses.push(`UPPER(COALESCE(m.vehicle_category, '')) = $${values.length}`);
            }
        }

        appendVehicleCategoryScope(req, clauses, values, "m");

        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

        const result = await db.query(`
            SELECT m.*
            FROM vehicle_models m
            ${where}
            ORDER BY m.model_name ASC
        `, values);

        res.json(result.rows);
    } catch (err) {
        console.error("VEHICLE MODELS FETCH ERROR:", err);
        res.status(500).json({ message: "Failed to load vehicle models" });
    }
});

router.post("/models", auth, requireVehicleManage, async (req, res) => {
    try {
        const modelName = cleanText(req.body.model_name);

        if (!modelName) {
            return res.status(400).json({ message: "Model name is required" });
        }

        const vehicleCategory = normalizeVehicleCategoryScope(req.body.vehicle_category);

        if (!requestedCategoryAllowed(req, vehicleCategory)) {
            return res.status(403).json({ message: "You cannot create vehicles outside your category scope" });
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
            vehicleCategory,
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

router.put("/models/:id", auth, requireVehicleManage, async (req, res) => {
    try {
        const id = parseId(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ message: "Invalid model id" });
        }

        const vehicleCategory = normalizeVehicleCategoryScope(req.body.vehicle_category);

        if (!requestedCategoryAllowed(req, vehicleCategory)) {
            return res.status(403).json({ message: "You cannot update vehicles outside your category scope" });
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
            vehicleCategory,
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

router.delete("/models/:id", auth, requireVehicleManage, async (req, res) => {
    try {
        const id = parseId(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ message: "Invalid model id" });
        }

        if (!(await ensureModelAllowedForUser(req, id))) {
            return res.status(403).json({ message: "You cannot deactivate vehicles outside your category scope" });
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
        const clauses = [];

        if (req.query.model_id) {
            const modelId = parseId(req.query.model_id);
            if (Number.isNaN(modelId)) {
                return res.status(400).json({ message: "Invalid model id" });
            }

            values.push(modelId);
            clauses.push(`v.model_id = $${values.length}`);
        }

        appendVehicleCategoryScope(req, clauses, values, "m");

        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

        const result = await db.query(`
            SELECT
                v.*,
                m.model_name,
                m.vehicle_category
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

router.post("/variants", auth, requireVehicleManage, async (req, res) => {
    try {
        const modelId = parseId(req.body.model_id);

        if (Number.isNaN(modelId)) {
            return res.status(400).json({ message: "Invalid model selected" });
        }

        if (!(await ensureModelAllowedForUser(req, modelId))) {
            return res.status(403).json({ message: "You cannot manage variants outside your category scope" });
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

router.put("/variants/:id", auth, requireVehicleManage, async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const modelId = parseId(req.body.model_id);

        if (Number.isNaN(id) || Number.isNaN(modelId)) {
            return res.status(400).json({ message: "Invalid variant or model id" });
        }

        if (!(await ensureModelAllowedForUser(req, modelId))) {
            return res.status(403).json({ message: "You cannot manage variants outside your category scope" });
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

router.delete("/variants/:id", auth, requireVehicleManage, async (req, res) => {
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
        const clauses = [];

        if (req.query.model_id) {
            const modelId = parseId(req.query.model_id);
            if (Number.isNaN(modelId)) {
                return res.status(400).json({ message: "Invalid model id" });
            }

            values.push(modelId);
            clauses.push(`c.model_id = $${values.length}`);
        }

        appendVehicleCategoryScope(req, clauses, values, "m");

        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

        const result = await db.query(`
            SELECT
                c.*,
                m.model_name,
                m.vehicle_category
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

router.post("/colors", auth, requireVehicleManage, async (req, res) => {
    try {
        const modelId = parseId(req.body.model_id);

        if (Number.isNaN(modelId)) {
            return res.status(400).json({ message: "Invalid model selected" });
        }

        if (!(await ensureModelAllowedForUser(req, modelId))) {
            return res.status(403).json({ message: "You cannot manage colors outside your category scope" });
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

router.put("/colors/:id", auth, requireVehicleManage, async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const modelId = parseId(req.body.model_id);

        if (Number.isNaN(id) || Number.isNaN(modelId)) {
            return res.status(400).json({ message: "Invalid color or model id" });
        }

        if (!(await ensureModelAllowedForUser(req, modelId))) {
            return res.status(403).json({ message: "You cannot manage colors outside your category scope" });
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

router.delete("/colors/:id", auth, requireVehicleManage, async (req, res) => {
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