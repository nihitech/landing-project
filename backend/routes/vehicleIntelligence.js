
const express = require("express");
const router = express.Router();
const db = require("../config/db");

function clean(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function category(value) {
    const c = clean(value || "AD").toUpperCase();
    return ["AD", "EV"].includes(c) ? c : "AD";
}

async function ensureOptionalIndexes() {
    try {
        await db.query(`CREATE INDEX IF NOT EXISTS idx_vehicles_category ON vehicles(vehicle_category)`);
    } catch (err) {}
    try {
        await db.query(`CREATE INDEX IF NOT EXISTS idx_vehicles_model ON vehicles(model)`);
    } catch (err) {}
}

/*
  Vehicle Intelligence API is intentionally read-only.
  It adapts to current Vehicle Master structure and returns dynamic lists
  for QR, Assisted Entry, Quick Enquiry, Lead and Booking forms.
*/

router.get("/models", async (req, res) => {
    try {
        await ensureOptionalIndexes();

        const vehicleCategory = category(req.query.category);

        const result = await db.query(`
            SELECT DISTINCT
                COALESCE(NULLIF(TRIM(model), ''), NULLIF(TRIM(name), '')) AS model
            FROM vehicles
            WHERE COALESCE(is_active, true) = true
            AND (
                UPPER(COALESCE(vehicle_category, category, 'AD')) = $1
                OR COALESCE(vehicle_category, category, 'ALL') = 'ALL'
            )
            AND COALESCE(NULLIF(TRIM(model), ''), NULLIF(TRIM(name), '')) IS NOT NULL
            ORDER BY model ASC
        `, [vehicleCategory]);

        res.json(result.rows.map(r => r.model).filter(Boolean));

    } catch (err) {
        console.error("VEHICLE INTELLIGENCE MODELS ERROR:", err);
        res.status(500).json({ message: "Failed to load vehicle models" });
    }
});

router.get("/variants", async (req, res) => {
    try {
        const vehicleCategory = category(req.query.category);
        const model = clean(req.query.model);

        if (!model) return res.json([]);

        const result = await db.query(`
            SELECT DISTINCT
                NULLIF(TRIM(variant), '') AS variant
            FROM vehicles
            WHERE COALESCE(is_active, true) = true
            AND (
                UPPER(COALESCE(vehicle_category, category, 'AD')) = $1
                OR COALESCE(vehicle_category, category, 'ALL') = 'ALL'
            )
            AND LOWER(COALESCE(model, name, '')) = LOWER($2)
            AND NULLIF(TRIM(variant), '') IS NOT NULL
            ORDER BY variant ASC
        `, [vehicleCategory, model]);

        res.json(result.rows.map(r => r.variant).filter(Boolean));

    } catch (err) {
        console.error("VEHICLE INTELLIGENCE VARIANTS ERROR:", err);
        res.status(500).json({ message: "Failed to load vehicle variants" });
    }
});

router.get("/fuels", async (req, res) => {
    try {
        const vehicleCategory = category(req.query.category);
        const model = clean(req.query.model);
        const variant = clean(req.query.variant);

        const values = [vehicleCategory];
        const clauses = [
            `COALESCE(is_active, true) = true`,
            `(UPPER(COALESCE(vehicle_category, category, 'AD')) = $1 OR COALESCE(vehicle_category, category, 'ALL') = 'ALL')`,
            `NULLIF(TRIM(fuel_type), '') IS NOT NULL`
        ];

        if (model) {
            values.push(model);
            clauses.push(`LOWER(COALESCE(model, name, '')) = LOWER($${values.length})`);
        }

        if (variant) {
            values.push(variant);
            clauses.push(`LOWER(COALESCE(variant, '')) = LOWER($${values.length})`);
        }

        const result = await db.query(`
            SELECT DISTINCT NULLIF(TRIM(fuel_type), '') AS fuel_type
            FROM vehicles
            WHERE ${clauses.join(" AND ")}
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
        const vehicleCategory = category(req.query.category);
        const model = clean(req.query.model);
        const variant = clean(req.query.variant);
        const fuel = clean(req.query.fuel_type);

        const values = [vehicleCategory];
        const clauses = [
            `COALESCE(is_active, true) = true`,
            `(UPPER(COALESCE(vehicle_category, category, 'AD')) = $1 OR COALESCE(vehicle_category, category, 'ALL') = 'ALL')`,
            `NULLIF(TRIM(color), '') IS NOT NULL`
        ];

        if (model) {
            values.push(model);
            clauses.push(`LOWER(COALESCE(model, name, '')) = LOWER($${values.length})`);
        }
        if (variant) {
            values.push(variant);
            clauses.push(`LOWER(COALESCE(variant, '')) = LOWER($${values.length})`);
        }
        if (fuel) {
            values.push(fuel);
            clauses.push(`LOWER(COALESCE(fuel_type, '')) = LOWER($${values.length})`);
        }

        const result = await db.query(`
            SELECT DISTINCT NULLIF(TRIM(color), '') AS color
            FROM vehicles
            WHERE ${clauses.join(" AND ")}
            ORDER BY color ASC
        `, values);

        res.json(result.rows.map(r => r.color).filter(Boolean));

    } catch (err) {
        console.error("VEHICLE INTELLIGENCE COLORS ERROR:", err);
        res.status(500).json({ message: "Failed to load vehicle colors" });
    }
});

router.get("/options", async (req, res) => {
    try {
        const vehicleCategory = category(req.query.category);
        const model = clean(req.query.model);
        const variant = clean(req.query.variant);
        const fuel = clean(req.query.fuel_type);

        const values = [vehicleCategory];
        const clauses = [
            `COALESCE(is_active, true) = true`,
            `(UPPER(COALESCE(vehicle_category, category, 'AD')) = $1 OR COALESCE(vehicle_category, category, 'ALL') = 'ALL')`
        ];

        if (model) {
            values.push(model);
            clauses.push(`LOWER(COALESCE(model, name, '')) = LOWER($${values.length})`);
        }
        if (variant) {
            values.push(variant);
            clauses.push(`LOWER(COALESCE(variant, '')) = LOWER($${values.length})`);
        }
        if (fuel) {
            values.push(fuel);
            clauses.push(`LOWER(COALESCE(fuel_type, '')) = LOWER($${values.length})`);
        }

        const result = await db.query(`
            SELECT DISTINCT
                COALESCE(NULLIF(TRIM(model), ''), NULLIF(TRIM(name), '')) AS model,
                NULLIF(TRIM(variant), '') AS variant,
                NULLIF(TRIM(fuel_type), '') AS fuel_type,
                NULLIF(TRIM(color), '') AS color
            FROM vehicles
            WHERE ${clauses.join(" AND ")}
            ORDER BY model ASC, variant ASC, fuel_type ASC, color ASC
        `, values);

        res.json({
            models: [...new Set(result.rows.map(r => r.model).filter(Boolean))],
            variants: [...new Set(result.rows.map(r => r.variant).filter(Boolean))],
            fuels: [...new Set(result.rows.map(r => r.fuel_type).filter(Boolean))],
            colors: [...new Set(result.rows.map(r => r.color).filter(Boolean))]
        });

    } catch (err) {
        console.error("VEHICLE INTELLIGENCE OPTIONS ERROR:", err);
        res.status(500).json({ message: "Failed to load vehicle options" });
    }
});

module.exports = router;
