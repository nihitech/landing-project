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

function canManageStock(req) {
    if (isAdminUser(req)) return true;

    const role = normalizeRole(req.user?.role);
    const managerRoles = ["manager", "branch_manager", "team_leader"];

    return managerRoles.includes(role) || req.user?.can_edit === true || req.user?.can_create === true;
}

function requireStockManage(req, res, next) {
    if (!canManageStock(req)) {
        return res.status(403).json({ message: "You do not have permission to manage stock" });
    }
    next();
}

function appendVehicleCategoryScope(req, clauses, values, modelAlias = "m") {
    if (isAdminUser(req)) return;

    const categoryScope = normalizeVehicleCategoryScope(req.user?.vehicle_category_scope);

    if (categoryScope === "ALL") return;

    values.push(categoryScope);
    clauses.push(`UPPER(COALESCE(${modelAlias}.vehicle_category, '')) = $${values.length}`);
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
    if (value === "" || value === null || value === undefined) return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

function parseQty(value) {
    const qty = Number(value || 0);
    return Number.isInteger(qty) && qty >= 0 ? qty : 0;
}

const STOCK_STATUSES = [
    "AVAILABLE",
    "LOW_STOCK",
    "IN_TRANSIT",
    "BILLING_SOON",
    "OEM_BILLED",
    "ARRIVED_YARD",
    "ARRIVED_BRANCH",
    "PDI_PENDING",
    "PDI_DONE",
    "BOOKED",
    "ALLOCATED_TO_CUSTOMER",
    "BLOCKED",
    "DEMO",
    "TEST_DRIVE",
    "DISPLAY",
    "WAITING",
    "PRODUCTION_DELAY",
    "NOT_AVAILABLE"
];

function normalizeStockStatus(value) {
    const status = cleanText(value || "AVAILABLE")
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

    return STOCK_STATUSES.includes(status) ? status : "AVAILABLE";
}

/* LIST STOCK SUMMARY */
router.get("/", auth, async (req, res) => {
    try {
        const clauses = [];
        const values = [];

        if (req.query.branch_id) {
            const branchId = parseId(req.query.branch_id);
            if (Number.isNaN(branchId)) {
                return res.status(400).json({ message: "Invalid branch filter" });
            }

            if (branchId) {
                values.push(branchId);
                clauses.push(`s.branch_id = $${values.length}`);
            }
        }

        if (req.query.model_id) {
            const modelId = parseId(req.query.model_id);
            if (Number.isNaN(modelId)) {
                return res.status(400).json({ message: "Invalid model filter" });
            }

            if (modelId) {
                values.push(modelId);
                clauses.push(`s.model_id = $${values.length}`);
            }
        }

        if (req.query.stock_status) {
            values.push(normalizeStockStatus(req.query.stock_status));
            clauses.push(`s.stock_status = $${values.length}`);
        }

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
            SELECT
                s.*,
                m.brand_name,
                m.model_name,
                m.vehicle_category,
                v.variant_name,
                c.color_name,
                b.branch_name,
                b.branch_code,

                (
                    COALESCE(s.available_quantity, 0)
                    + COALESCE(s.in_transit_quantity, 0)
                    + COALESCE(s.billing_soon_quantity, 0)
                )::int AS total_pipeline_quantity

            FROM vehicle_stock_summary s
            LEFT JOIN vehicle_models m ON m.id = s.model_id
            LEFT JOIN vehicle_variants v ON v.id = s.variant_id
            LEFT JOIN vehicle_colors c ON c.id = s.color_id
            LEFT JOIN branches b ON b.id = s.branch_id
            ${where}
            ORDER BY 
                b.branch_name ASC,
                m.model_name ASC,
                v.variant_name ASC,
                c.color_name ASC
        `, values);

        res.json(result.rows);

    } catch (err) {
        console.error("STOCK SUMMARY FETCH ERROR:", err);
        res.status(500).json({ message: "Failed to load stock summary" });
    }
});

/* CREATE STOCK SUMMARY */
router.post("/", auth, requireStockManage, async (req, res) => {
    try {
        const modelId = parseId(req.body.model_id);
        const variantId = parseId(req.body.variant_id);
        const colorId = parseId(req.body.color_id);
        const branchId = parseId(req.body.branch_id);

        if (
            Number.isNaN(modelId) ||
            Number.isNaN(variantId) ||
            Number.isNaN(colorId) ||
            Number.isNaN(branchId) ||
            !modelId ||
            !variantId ||
            !colorId ||
            !branchId
        ) {
            return res.status(400).json({
                message: "Model, variant, color and branch are required"
            });
        }

        if (!(await ensureModelAllowedForUser(req, modelId))) {
            return res.status(403).json({
                message: "You cannot manage stock outside your vehicle category scope"
            });
        }

        const result = await db.query(`
            INSERT INTO vehicle_stock_summary
            (
                model_id,
                variant_id,
                color_id,
                branch_id,
                stock_status,
                available_quantity,
                booked_quantity,
                in_transit_quantity,
                billing_soon_quantity,
                waiting_period_days,
                expected_arrival_date,
                remarks,
                status
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING *
        `, [
            modelId,
            variantId,
            colorId,
            branchId,
            normalizeStockStatus(req.body.stock_status),
            parseQty(req.body.available_quantity),
            parseQty(req.body.booked_quantity),
            parseQty(req.body.in_transit_quantity),
            parseQty(req.body.billing_soon_quantity),
            parseQty(req.body.waiting_period_days),
            req.body.expected_arrival_date || null,
            cleanText(req.body.remarks),
            cleanText(req.body.status || "ACTIVE").toUpperCase()
        ]);

        res.status(201).json({
            message: "Stock summary created successfully",
            stock: result.rows[0]
        });

    } catch (err) {
        console.error("STOCK SUMMARY CREATE ERROR:", err);
        res.status(500).json({ message: "Failed to create stock summary" });
    }
});

/* UPDATE STOCK SUMMARY */
router.put("/:id", auth, requireStockManage, async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const modelId = parseId(req.body.model_id);
        const variantId = parseId(req.body.variant_id);
        const colorId = parseId(req.body.color_id);
        const branchId = parseId(req.body.branch_id);

        if (
            Number.isNaN(id) ||
            Number.isNaN(modelId) ||
            Number.isNaN(variantId) ||
            Number.isNaN(colorId) ||
            Number.isNaN(branchId) ||
            !id ||
            !modelId ||
            !variantId ||
            !colorId ||
            !branchId
        ) {
            return res.status(400).json({
                message: "Invalid stock, model, variant, color or branch"
            });
        }

        if (!(await ensureModelAllowedForUser(req, modelId))) {
            return res.status(403).json({
                message: "You cannot manage stock outside your vehicle category scope"
            });
        }

        const result = await db.query(`
            UPDATE vehicle_stock_summary
            SET
                model_id = $1,
                variant_id = $2,
                color_id = $3,
                branch_id = $4,
                stock_status = $5,
                available_quantity = $6,
                booked_quantity = $7,
                in_transit_quantity = $8,
                billing_soon_quantity = $9,
                waiting_period_days = $10,
                expected_arrival_date = $11,
                remarks = $12,
                status = $13,
                updated_at = NOW()
            WHERE id = $14
            RETURNING *
        `, [
            modelId,
            variantId,
            colorId,
            branchId,
            normalizeStockStatus(req.body.stock_status),
            parseQty(req.body.available_quantity),
            parseQty(req.body.booked_quantity),
            parseQty(req.body.in_transit_quantity),
            parseQty(req.body.billing_soon_quantity),
            parseQty(req.body.waiting_period_days),
            req.body.expected_arrival_date || null,
            cleanText(req.body.remarks),
            cleanText(req.body.status || "ACTIVE").toUpperCase(),
            id
        ]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Stock summary not found" });
        }

        res.json({
            message: "Stock summary updated successfully",
            stock: result.rows[0]
        });

    } catch (err) {
        console.error("STOCK SUMMARY UPDATE ERROR:", err);
        res.status(500).json({ message: "Failed to update stock summary" });
    }
});

/* DEACTIVATE STOCK SUMMARY */
router.delete("/:id", auth, requireStockManage, async (req, res) => {
    try {
        const id = parseId(req.params.id);

        if (Number.isNaN(id) || !id) {
            return res.status(400).json({ message: "Invalid stock id" });
        }

        const result = await db.query(`
            UPDATE vehicle_stock_summary
            SET status = 'INACTIVE', updated_at = NOW()
            WHERE id = $1
            RETURNING id
        `, [id]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Stock summary not found" });
        }

        res.json({ message: "Stock summary deactivated" });

    } catch (err) {
        console.error("STOCK SUMMARY DELETE ERROR:", err);
        res.status(500).json({ message: "Failed to deactivate stock summary" });
    }
});

/* QUICK AVAILABILITY FOR SALES USERS */
router.get("/availability/search", auth, async (req, res) => {
    try {
        const search = cleanText(req.query.search).toLowerCase();

        const values = [];
        const clauses = ["s.status = 'ACTIVE'"];

        appendVehicleCategoryScope(req, clauses, values, "m");

        if (search) {
            values.push(`%${search}%`);
            clauses.push(`(
                LOWER(m.model_name) LIKE $${values.length}
                OR LOWER(v.variant_name) LIKE $${values.length}
                OR LOWER(c.color_name) LIKE $${values.length}
                OR LOWER(b.branch_name) LIKE $${values.length}
            )`);
        }

        const result = await db.query(`
            SELECT
                s.id,
                s.stock_status,
                s.available_quantity,
                s.booked_quantity,
                s.in_transit_quantity,
                s.billing_soon_quantity,
                s.waiting_period_days,
                s.expected_arrival_date,
                s.remarks,
                m.model_name,
                m.vehicle_category,
                v.variant_name,
                c.color_name,
                b.branch_name,
                b.branch_code
            FROM vehicle_stock_summary s
            LEFT JOIN vehicle_models m ON m.id = s.model_id
            LEFT JOIN vehicle_variants v ON v.id = s.variant_id
            LEFT JOIN vehicle_colors c ON c.id = s.color_id
            LEFT JOIN branches b ON b.id = s.branch_id
            WHERE ${clauses.join(" AND ")}
            ORDER BY
                s.available_quantity DESC,
                s.in_transit_quantity DESC,
                s.expected_arrival_date ASC NULLS LAST
            LIMIT 50
        `, values);

        res.json(result.rows);

    } catch (err) {
        console.error("STOCK AVAILABILITY SEARCH ERROR:", err);
        res.status(500).json({ message: "Failed to search stock availability" });
    }
});

module.exports = router;