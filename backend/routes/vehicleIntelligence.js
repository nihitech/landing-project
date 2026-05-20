const express = require("express");
const router = express.Router();
const db = require("../config/db");

function clean(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function normalizeCategory(value) {
    const c = clean(value || "AD").toUpperCase();
    return ["AD", "EV"].includes(c) ? c : "AD";
}

/*
  NIKRION Vehicle Intelligence API
  Real table mapping:
  - vehicle_models        : id, model_name, vehicle_category, fuel_type, status
  - vehicle_variants      : id, model_id, variant_name, fuel_type, status
  - vehicle_colors        : id, model_id, color_name, status
  - vehicle_stock_summary : model_id, variant_id, color_id, stock_status, available_quantity
*/

async function ensureIndexes() {
    const queries = [
        `CREATE INDEX IF NOT EXISTS idx_vehicle_models_category ON vehicle_models(vehicle_category)`,
        `CREATE INDEX IF NOT EXISTS idx_vehicle_models_status ON vehicle_models(status)`,
        `CREATE INDEX IF NOT EXISTS idx_vehicle_models_name ON vehicle_models(model_name)`,
        `CREATE INDEX IF NOT EXISTS idx_vehicle_variants_model ON vehicle_variants(model_id)`,
        `CREATE INDEX IF NOT EXISTS idx_vehicle_variants_name ON vehicle_variants(variant_name)`,
        `CREATE INDEX IF NOT EXISTS idx_vehicle_colors_model ON vehicle_colors(model_id)`,
        `CREATE INDEX IF NOT EXISTS idx_vehicle_colors_name ON vehicle_colors(color_name)`
    ];

    for (const q of queries) {
        try { await db.query(q); } catch (err) {}
    }
}

router.get("/models", async (req, res) => {
    try {
        await ensureIndexes();

        const vehicleCategory = normalizeCategory(req.query.category || req.query.vehicle_category);

        const result = await db.query(`
            SELECT DISTINCT model_name
            FROM vehicle_models
            WHERE UPPER(COALESCE(vehicle_category, 'AD')) = $1
            AND UPPER(COALESCE(status, 'ACTIVE')) = 'ACTIVE'
            AND NULLIF(TRIM(model_name), '') IS NOT NULL
            ORDER BY model_name ASC
        `, [vehicleCategory]);

        res.json(result.rows.map(r => r.model_name).filter(Boolean));

    } catch (err) {
        console.error("VEHICLE INTELLIGENCE MODELS ERROR:", err);
        res.status(500).json({ message: "Failed to load vehicle models" });
    }
});

router.get("/variants", async (req, res) => {
    try {
        const vehicleCategory = normalizeCategory(req.query.category || req.query.vehicle_category);
        const model = clean(req.query.model);

        if (!model) return res.json([]);

        const result = await db.query(`
            SELECT DISTINCT v.variant_name
            FROM vehicle_variants v
            INNER JOIN vehicle_models m ON m.id = v.model_id
            WHERE UPPER(COALESCE(m.vehicle_category, 'AD')) = $1
            AND LOWER(TRIM(m.model_name)) = LOWER(TRIM($2))
            AND UPPER(COALESCE(m.status, 'ACTIVE')) = 'ACTIVE'
            AND UPPER(COALESCE(v.status, 'ACTIVE')) = 'ACTIVE'
            AND NULLIF(TRIM(v.variant_name), '') IS NOT NULL
            ORDER BY v.variant_name ASC
        `, [vehicleCategory, model]);

        res.json(result.rows.map(r => r.variant_name).filter(Boolean));

    } catch (err) {
        console.error("VEHICLE INTELLIGENCE VARIANTS ERROR:", err);
        res.status(500).json({ message: "Failed to load vehicle variants" });
    }
});

router.get("/fuels", async (req, res) => {
    try {
        const vehicleCategory = normalizeCategory(req.query.category || req.query.vehicle_category);
        const model = clean(req.query.model);
        const variant = clean(req.query.variant);

        const values = [vehicleCategory];
        const clauses = [
            `UPPER(COALESCE(m.vehicle_category, 'AD')) = $1`,
            `UPPER(COALESCE(m.status, 'ACTIVE')) = 'ACTIVE'`
        ];

        if (model) {
            values.push(model);
            clauses.push(`LOWER(TRIM(m.model_name)) = LOWER(TRIM($${values.length}))`);
        }

        if (variant) {
            values.push(variant);
            clauses.push(`LOWER(TRIM(v.variant_name)) = LOWER(TRIM($${values.length}))`);
        }

        const result = await db.query(`
            SELECT DISTINCT COALESCE(NULLIF(TRIM(v.fuel_type), ''), NULLIF(TRIM(m.fuel_type), '')) AS fuel_type
            FROM vehicle_models m
            LEFT JOIN vehicle_variants v ON v.model_id = m.id
            WHERE ${clauses.join(" AND ")}
            AND COALESCE(NULLIF(TRIM(v.fuel_type), ''), NULLIF(TRIM(m.fuel_type), '')) IS NOT NULL
            ORDER BY fuel_type ASC
        `, values);

        res.json(result.rows.map(r => r.fuel_type).filter(Boolean));

    } catch (err) {
        console.error("VEHICLE INTELLIGENCE FUELS ERROR:", err);
        res.status(500).json({ message: "Failed to load fuel types" });
    }
});

router.get("/colors", async (req, res) => {
    try {
        const vehicleCategory = normalizeCategory(req.query.category || req.query.vehicle_category);
        const model = clean(req.query.model);

        const values = [vehicleCategory];
        const clauses = [
            `UPPER(COALESCE(m.vehicle_category, 'AD')) = $1`,
            `UPPER(COALESCE(m.status, 'ACTIVE')) = 'ACTIVE'`,
            `UPPER(COALESCE(c.status, 'ACTIVE')) = 'ACTIVE'`,
            `NULLIF(TRIM(c.color_name), '') IS NOT NULL`
        ];

        if (model) {
            values.push(model);
            clauses.push(`LOWER(TRIM(m.model_name)) = LOWER(TRIM($${values.length}))`);
        }

        const result = await db.query(`
            SELECT DISTINCT c.color_name
            FROM vehicle_colors c
            INNER JOIN vehicle_models m ON m.id = c.model_id
            WHERE ${clauses.join(" AND ")}
            ORDER BY c.color_name ASC
        `, values);

        res.json(result.rows.map(r => r.color_name).filter(Boolean));

    } catch (err) {
        console.error("VEHICLE INTELLIGENCE COLORS ERROR:", err);
        res.status(500).json({ message: "Failed to load vehicle colors" });
    }
});

router.get("/options", async (req, res) => {
    try {
        const vehicleCategory = normalizeCategory(req.query.category || req.query.vehicle_category);
        const model = clean(req.query.model);
        const variant = clean(req.query.variant);

        const modelValues = [vehicleCategory];
        const modelClauses = [
            `UPPER(COALESCE(vehicle_category, 'AD')) = $1`,
            `UPPER(COALESCE(status, 'ACTIVE')) = 'ACTIVE'`
        ];

        if (model) {
            modelValues.push(model);
            modelClauses.push(`LOWER(TRIM(model_name)) = LOWER(TRIM($${modelValues.length}))`);
        }

        const modelsRes = await db.query(`
            SELECT DISTINCT model_name
            FROM vehicle_models
            WHERE ${modelClauses.join(" AND ")}
            AND NULLIF(TRIM(model_name), '') IS NOT NULL
            ORDER BY model_name ASC
        `, modelValues);

        const variantValues = [vehicleCategory];
        const variantClauses = [
            `UPPER(COALESCE(m.vehicle_category, 'AD')) = $1`,
            `UPPER(COALESCE(m.status, 'ACTIVE')) = 'ACTIVE'`,
            `UPPER(COALESCE(v.status, 'ACTIVE')) = 'ACTIVE'`
        ];

        if (model) {
            variantValues.push(model);
            variantClauses.push(`LOWER(TRIM(m.model_name)) = LOWER(TRIM($${variantValues.length}))`);
        }

        const variantsRes = await db.query(`
            SELECT DISTINCT v.variant_name
            FROM vehicle_variants v
            INNER JOIN vehicle_models m ON m.id = v.model_id
            WHERE ${variantClauses.join(" AND ")}
            AND NULLIF(TRIM(v.variant_name), '') IS NOT NULL
            ORDER BY v.variant_name ASC
        `, variantValues);

        const fuelValues = [vehicleCategory];
        const fuelClauses = [
            `UPPER(COALESCE(m.vehicle_category, 'AD')) = $1`,
            `UPPER(COALESCE(m.status, 'ACTIVE')) = 'ACTIVE'`
        ];

        if (model) {
            fuelValues.push(model);
            fuelClauses.push(`LOWER(TRIM(m.model_name)) = LOWER(TRIM($${fuelValues.length}))`);
        }
        if (variant) {
            fuelValues.push(variant);
            fuelClauses.push(`LOWER(TRIM(v.variant_name)) = LOWER(TRIM($${fuelValues.length}))`);
        }

        const fuelsRes = await db.query(`
            SELECT DISTINCT COALESCE(NULLIF(TRIM(v.fuel_type), ''), NULLIF(TRIM(m.fuel_type), '')) AS fuel_type
            FROM vehicle_models m
            LEFT JOIN vehicle_variants v ON v.model_id = m.id
            WHERE ${fuelClauses.join(" AND ")}
            AND COALESCE(NULLIF(TRIM(v.fuel_type), ''), NULLIF(TRIM(m.fuel_type), '')) IS NOT NULL
            ORDER BY fuel_type ASC
        `, fuelValues);

        const colorValues = [vehicleCategory];
        const colorClauses = [
            `UPPER(COALESCE(m.vehicle_category, 'AD')) = $1`,
            `UPPER(COALESCE(m.status, 'ACTIVE')) = 'ACTIVE'`,
            `UPPER(COALESCE(c.status, 'ACTIVE')) = 'ACTIVE'`
        ];

        if (model) {
            colorValues.push(model);
            colorClauses.push(`LOWER(TRIM(m.model_name)) = LOWER(TRIM($${colorValues.length}))`);
        }

        const colorsRes = await db.query(`
            SELECT DISTINCT c.color_name
            FROM vehicle_colors c
            INNER JOIN vehicle_models m ON m.id = c.model_id
            WHERE ${colorClauses.join(" AND ")}
            AND NULLIF(TRIM(c.color_name), '') IS NOT NULL
            ORDER BY c.color_name ASC
        `, colorValues);

        res.json({
            models: modelsRes.rows.map(r => r.model_name).filter(Boolean),
            variants: variantsRes.rows.map(r => r.variant_name).filter(Boolean),
            fuels: fuelsRes.rows.map(r => r.fuel_type).filter(Boolean),
            colors: colorsRes.rows.map(r => r.color_name).filter(Boolean)
        });

    } catch (err) {
        console.error("VEHICLE INTELLIGENCE OPTIONS ERROR:", err);
        res.status(500).json({ message: "Failed to load vehicle options" });
    }
});

module.exports = router;
