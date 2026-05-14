const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
}

function isAdminUser(req) {
    return normalizeRole(req.user?.role) === "admin";
}

function requireInventoryView(req, res, next) {
    if (
        isAdminUser(req) ||
        req.user?.can_view === true ||
        Array.isArray(req.user?.permissions) && req.user.permissions.includes("inventory.view")
    ) {
        return next();
    }

    return res.status(403).json({
        message: "You do not have permission to view inventory"
    });
}

function requireInventoryManage(req, res, next) {
    if (
        isAdminUser(req) ||
        req.user?.can_edit === true ||
        Array.isArray(req.user?.permissions) && req.user.permissions.includes("inventory.manage")
    ) {
        return next();
    }

    return res.status(403).json({
        message: "You do not have permission to manage inventory"
    });
}

function cleanText(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function parseId(value) {
    if (value === "" || value === null || value === undefined) return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

function nullableDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : value;
}

function normalizeVehicleCategory(value) {
    const category = cleanText(value || "AD").toUpperCase();
    return ["AD", "EV"].includes(category) ? category : "AD";
}

function normalizeStatus(value) {
    const status = cleanText(value || "AVAILABLE")
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

    const allowed = [
        "AVAILABLE",
        "IN_TRANSIT",
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
        "RETAIL_DONE",
        "DELIVERED",
        "DELIVERY_HOLD",
        "CANCELLED"
    ];

    return allowed.includes(status) ? status : "AVAILABLE";
}

function normalizePdiStatus(value) {
    const status = cleanText(value || "PDI_PENDING")
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

    const allowed = [
        "PDI_PENDING",
        "PDI_IN_PROGRESS",
        "PDI_DONE",
        "PDI_FAILED",
        "PDI_HOLD"
    ];

    return allowed.includes(status) ? status : "PDI_PENDING";
}

function appendCategoryScope(req, clauses, values, alias = "i") {
    if (isAdminUser(req)) return;

    const scope = cleanText(req.user?.vehicle_category_scope || "ALL").toUpperCase();

    if (scope === "EV" || scope === "AD") {
        values.push(scope);
        clauses.push(`${alias}.vehicle_category = $${values.length}`);
    }
}

function appendBranchScope(req, clauses, values, alias = "i") {
    if (isAdminUser(req)) return;

    const dataScope = cleanText(req.user?.data_scope || "OWN").toUpperCase();

    if (["BRANCH", "DEPARTMENT", "TEAM", "VIEW_ONLY"].includes(dataScope) && req.user?.branch_id) {
        values.push(req.user.branch_id);
        clauses.push(`${alias}.branch_id = $${values.length}`);
    }
}

async function logLeadActivity({
    lead_id,
    user_id = null,
    action,
    old_value = "",
    new_value = "",
    remarks = ""
}) {
    try {
        if (!lead_id || !action) return;

        await db.query(`
            INSERT INTO activity_logs
            (lead_id, user_id, action, old_value, new_value, remarks)
            VALUES ($1,$2,$3,$4,$5,$6)
        `, [
            lead_id,
            user_id,
            cleanText(action),
            cleanText(old_value),
            cleanText(new_value),
            cleanText(remarks)
        ]);
    } catch (err) {
        console.error("INVENTORY LEAD ACTIVITY LOG ERROR:", err.message);
    }
}

/* LIST INVENTORY */
router.get("/", auth, requireInventoryView, async (req, res) => {
    try {
        const clauses = ["i.status = 'ACTIVE'"];
        const values = [];

        appendCategoryScope(req, clauses, values, "i");
        appendBranchScope(req, clauses, values, "i");

        if (req.query.branch_id) {
            const branchId = parseId(req.query.branch_id);
            if (Number.isNaN(branchId)) {
                return res.status(400).json({ message: "Invalid branch filter" });
            }

            if (branchId) {
                values.push(branchId);
                clauses.push(`i.branch_id = $${values.length}`);
            }
        }

        if (req.query.model_id) {
            const modelId = parseId(req.query.model_id);
            if (Number.isNaN(modelId)) {
                return res.status(400).json({ message: "Invalid model filter" });
            }

            if (modelId) {
                values.push(modelId);
                clauses.push(`i.model_id = $${values.length}`);
            }
        }

        if (req.query.vehicle_category) {
            values.push(normalizeVehicleCategory(req.query.vehicle_category));
            clauses.push(`i.vehicle_category = $${values.length}`);
        }

        if (req.query.vehicle_status) {
            values.push(normalizeStatus(req.query.vehicle_status));
            clauses.push(`i.vehicle_status = $${values.length}`);
        }

        if (req.query.search) {
            values.push(`%${cleanText(req.query.search).toLowerCase()}%`);
            clauses.push(`(
                LOWER(COALESCE(i.vin_number,'')) LIKE $${values.length}
                OR LOWER(COALESCE(i.chassis_number,'')) LIKE $${values.length}
                OR LOWER(COALESCE(i.engine_number,'')) LIKE $${values.length}
                OR LOWER(COALESCE(m.model_name,'')) LIKE $${values.length}
                OR LOWER(COALESCE(v.variant_name,'')) LIKE $${values.length}
                OR LOWER(COALESCE(c.color_name,'')) LIKE $${values.length}
                OR LOWER(COALESCE(b.branch_name,'')) LIKE $${values.length}
            )`);
        }

        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

        const result = await db.query(`
            SELECT
                i.*,
                m.brand_name,
                m.model_name,
                v.variant_name,
                c.color_name,
                b.branch_name,
                b.branch_code,
                l.name AS allocated_lead_name,
                l.phone AS allocated_lead_phone,

                CASE
                    WHEN i.delivery_date IS NOT NULL THEN 'DELIVERED'
                    WHEN i.retail_date IS NOT NULL THEN 'RETAIL_DONE'
                    WHEN i.allocated_lead_id IS NOT NULL THEN 'ALLOCATED'
                    WHEN i.actual_arrival_date IS NOT NULL THEN 'ARRIVED'
                    WHEN i.dispatch_date IS NOT NULL THEN 'IN_TRANSIT'
                    ELSE i.vehicle_status
                END AS live_status,

                CASE
                    WHEN i.actual_arrival_date IS NOT NULL 
                        THEN GREATEST(0, DATE_PART('day', NOW() - i.actual_arrival_date)::int)
                    WHEN i.oem_billing_date IS NOT NULL
                        THEN GREATEST(0, DATE_PART('day', NOW() - i.oem_billing_date)::int)
                    ELSE 0
                END AS stock_age_days

            FROM vehicle_inventory_units i
            LEFT JOIN vehicle_models m ON m.id = i.model_id
            LEFT JOIN vehicle_variants v ON v.id = i.variant_id
            LEFT JOIN vehicle_colors c ON c.id = i.color_id
            LEFT JOIN branches b ON b.id = i.branch_id
            LEFT JOIN leads l ON l.id = i.allocated_lead_id
            ${where}
            ORDER BY i.updated_at DESC, i.id DESC
            LIMIT 500
        `, values);

        res.json(result.rows);

    } catch (err) {
        console.error("INVENTORY FETCH ERROR:", err);
        res.status(500).json({ message: "Failed to load inventory" });
    }
});

/* CREATE INVENTORY UNIT */
router.post("/", auth, requireInventoryManage, async (req, res) => {
    try {
        const modelId = parseId(req.body.model_id);
        const variantId = parseId(req.body.variant_id);
        const colorId = parseId(req.body.color_id);
        const branchId = parseId(req.body.branch_id);
        const allocatedLeadId = parseId(req.body.allocated_lead_id);

        if (
            Number.isNaN(modelId) ||
            Number.isNaN(variantId) ||
            Number.isNaN(colorId) ||
            Number.isNaN(branchId) ||
            Number.isNaN(allocatedLeadId) ||
            !modelId ||
            !variantId ||
            !colorId ||
            !branchId
        ) {
            return res.status(400).json({
                message: "Model, variant, color and branch are required"
            });
        }

        const category = normalizeVehicleCategory(req.body.vehicle_category);
        const userScope = cleanText(req.user?.vehicle_category_scope || "ALL").toUpperCase();

        if (!isAdminUser(req) && ["AD", "EV"].includes(userScope) && userScope !== category) {
            return res.status(403).json({
                message: `You can manage only ${userScope} inventory`
            });
        }

        const vinNumber = cleanText(req.body.vin_number).toUpperCase();

        const result = await db.query(`
            INSERT INTO vehicle_inventory_units
            (
                model_id,
                variant_id,
                color_id,
                branch_id,
                vehicle_category,
                vin_number,
                chassis_number,
                engine_number,
                vehicle_status,
                oem_order_no,
                oem_invoice_no,
                oem_billing_date,
                dispatch_date,
                expected_arrival_date,
                actual_arrival_date,
                pdi_status,
                pdi_completed_at,
                allocated_lead_id,
                allocated_customer_name,
                booking_id,
                customer_invoice_no,
                retail_date,
                delivery_date,
                yard_location,
                remarks,
                status,
                created_by,
                updated_by
            )
            VALUES
            (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                $21,$22,$23,$24,$25,$26,$27,$28
            )
            RETURNING *
        `, [
            modelId,
            variantId,
            colorId,
            branchId,
            category,
            vinNumber || null,
            cleanText(req.body.chassis_number).toUpperCase(),
            cleanText(req.body.engine_number).toUpperCase(),
            normalizeStatus(req.body.vehicle_status),
            cleanText(req.body.oem_order_no),
            cleanText(req.body.oem_invoice_no),
            nullableDate(req.body.oem_billing_date),
            nullableDate(req.body.dispatch_date),
            nullableDate(req.body.expected_arrival_date),
            nullableDate(req.body.actual_arrival_date),
            normalizePdiStatus(req.body.pdi_status),
            req.body.pdi_status === "PDI_DONE" ? new Date() : null,
            allocatedLeadId,
            cleanText(req.body.allocated_customer_name),
            cleanText(req.body.booking_id),
            cleanText(req.body.customer_invoice_no),
            nullableDate(req.body.retail_date),
            nullableDate(req.body.delivery_date),
            cleanText(req.body.yard_location),
            cleanText(req.body.remarks),
            cleanText(req.body.status || "ACTIVE").toUpperCase(),
            req.user.id,
            req.user.id
        ]);

        res.status(201).json({
            message: "Inventory vehicle created successfully",
            inventory: result.rows[0]
        });

    } catch (err) {
        console.error("INVENTORY CREATE ERROR:", err);

        if (err.code === "23505") {
            return res.status(400).json({
                message: "VIN number already exists"
            });
        }

        res.status(500).json({ message: "Failed to create inventory vehicle" });
    }
});

/* UPDATE INVENTORY UNIT */
router.put("/:id", auth, requireInventoryManage, async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const modelId = parseId(req.body.model_id);
        const variantId = parseId(req.body.variant_id);
        const colorId = parseId(req.body.color_id);
        const branchId = parseId(req.body.branch_id);
        const allocatedLeadId = parseId(req.body.allocated_lead_id);

        if (
            Number.isNaN(id) ||
            Number.isNaN(modelId) ||
            Number.isNaN(variantId) ||
            Number.isNaN(colorId) ||
            Number.isNaN(branchId) ||
            Number.isNaN(allocatedLeadId) ||
            !id ||
            !modelId ||
            !variantId ||
            !colorId ||
            !branchId
        ) {
            return res.status(400).json({
                message: "Invalid inventory, model, variant, color or branch"
            });
        }

        const category = normalizeVehicleCategory(req.body.vehicle_category);
        const userScope = cleanText(req.user?.vehicle_category_scope || "ALL").toUpperCase();

        if (!isAdminUser(req) && ["AD", "EV"].includes(userScope) && userScope !== category) {
            return res.status(403).json({
                message: `You can manage only ${userScope} inventory`
            });
        }

        const accessValues = [id];
        const accessClauses = ["i.id = $1"];

        appendCategoryScope(req, accessClauses, accessValues, "i");
        appendBranchScope(req, accessClauses, accessValues, "i");

        const access = await db.query(`
            SELECT i.id
            FROM vehicle_inventory_units i
            WHERE ${accessClauses.join(" AND ")}
            LIMIT 1
        `, accessValues);

        if (!access.rows.length) {
            return res.status(404).json({
                message: "Inventory vehicle not found or not accessible"
            });
        }

        const result = await db.query(`
            UPDATE vehicle_inventory_units
            SET
                model_id = $1,
                variant_id = $2,
                color_id = $3,
                branch_id = $4,
                vehicle_category = $5,
                vin_number = $6,
                chassis_number = $7,
                engine_number = $8,
                vehicle_status = $9,
                oem_order_no = $10,
                oem_invoice_no = $11,
                oem_billing_date = $12,
                dispatch_date = $13,
                expected_arrival_date = $14,
                actual_arrival_date = $15,
                pdi_status = $16,
                pdi_completed_at = CASE
                    WHEN $16 = 'PDI_DONE' AND pdi_completed_at IS NULL THEN NOW()
                    WHEN $16 <> 'PDI_DONE' THEN NULL
                    ELSE pdi_completed_at
                END,
                allocated_lead_id = $17,
                allocated_customer_name = $18,
                booking_id = $19,
                customer_invoice_no = $20,
                retail_date = $21,
                delivery_date = $22,
                yard_location = $23,
                remarks = $24,
                status = $25,
                updated_by = $26,
                updated_at = NOW()
            WHERE id = $27
            RETURNING *
        `, [
            modelId,
            variantId,
            colorId,
            branchId,
            category,
            cleanText(req.body.vin_number).toUpperCase() || null,
            cleanText(req.body.chassis_number).toUpperCase(),
            cleanText(req.body.engine_number).toUpperCase(),
            normalizeStatus(req.body.vehicle_status),
            cleanText(req.body.oem_order_no),
            cleanText(req.body.oem_invoice_no),
            nullableDate(req.body.oem_billing_date),
            nullableDate(req.body.dispatch_date),
            nullableDate(req.body.expected_arrival_date),
            nullableDate(req.body.actual_arrival_date),
            normalizePdiStatus(req.body.pdi_status),
            allocatedLeadId,
            cleanText(req.body.allocated_customer_name),
            cleanText(req.body.booking_id),
            cleanText(req.body.customer_invoice_no),
            nullableDate(req.body.retail_date),
            nullableDate(req.body.delivery_date),
            cleanText(req.body.yard_location),
            cleanText(req.body.remarks),
            cleanText(req.body.status || "ACTIVE").toUpperCase(),
            req.user.id,
            id
        ]);

        res.json({
            message: "Inventory vehicle updated successfully",
            inventory: result.rows[0]
        });

    } catch (err) {
        console.error("INVENTORY UPDATE ERROR:", err);

        if (err.code === "23505") {
            return res.status(400).json({
                message: "VIN number already exists"
            });
        }

        res.status(500).json({ message: "Failed to update inventory vehicle" });
    }
});

/* ALLOCATE INVENTORY VEHICLE TO LEAD */
router.post("/:id/allocate-lead", auth, requireInventoryManage, async (req, res) => {
    const client = await db.connect();

    try {
        const inventoryId = parseId(req.params.id);
        const leadId = parseId(req.body.lead_id);

        if (Number.isNaN(inventoryId) || Number.isNaN(leadId) || !inventoryId || !leadId) {
            return res.status(400).json({
                message: "Valid inventory id and lead id are required"
            });
        }

        await client.query("BEGIN");

        const accessValues = [inventoryId];
        const accessClauses = [
            "i.id = $1",
            "i.status = 'ACTIVE'"
        ];

        appendCategoryScope(req, accessClauses, accessValues, "i");
        appendBranchScope(req, accessClauses, accessValues, "i");

        const inventoryResult = await client.query(`
            SELECT
                i.*,
                m.model_name,
                v.variant_name,
                c.color_name,
                b.branch_name
            FROM vehicle_inventory_units i
            LEFT JOIN vehicle_models m ON m.id = i.model_id
            LEFT JOIN vehicle_variants v ON v.id = i.variant_id
            LEFT JOIN vehicle_colors c ON c.id = i.color_id
            LEFT JOIN branches b ON b.id = i.branch_id
            WHERE ${accessClauses.join(" AND ")}
            FOR UPDATE
        `, accessValues);

        if (!inventoryResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Inventory vehicle not found or not accessible"
            });
        }

        const inventory = inventoryResult.rows[0];

        if (
            inventory.allocated_lead_id &&
            Number(inventory.allocated_lead_id) !== Number(leadId)
        ) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "This vehicle is already allocated to another lead"
            });
        }

        if (["DELIVERED", "RETAIL_DONE", "CANCELLED"].includes(String(inventory.vehicle_status || "").toUpperCase())) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Delivered, retailed or cancelled vehicle cannot be allocated"
            });
        }

        const leadResult = await client.query(`
            SELECT
                id,
                name,
                phone,
                car_interest,
                variant_interest,
                preferred_color,
                status,
                allocated_inventory_id
            FROM leads
            WHERE id = $1
            FOR UPDATE
        `, [leadId]);

        if (!leadResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Lead not found"
            });
        }

        const lead = leadResult.rows[0];

        if (
            lead.allocated_inventory_id &&
            Number(lead.allocated_inventory_id) !== Number(inventoryId)
        ) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "This lead already has another vehicle allocated"
            });
        }

        await client.query(`
            UPDATE vehicle_inventory_units
            SET
                allocated_lead_id = $1,
                allocated_customer_name = $2,
                vehicle_status = 'ALLOCATED_TO_CUSTOMER',
                updated_by = $3,
                updated_at = NOW()
            WHERE id = $4
        `, [
            leadId,
            lead.name,
            req.user.id,
            inventoryId
        ]);

        await client.query(`
            UPDATE leads
            SET
                allocated_inventory_id = $1,
                allocated_vin_number = $2,
                vehicle_allocated_at = NOW(),
                vehicle_allocation_status = 'ALLOCATED',
                status = CASE
                    WHEN status IN ('NEW','CONTACTED','FOLLOW-UP','TEST-DRIVE')
                    THEN 'BOOKED'
                    ELSE status
                END,
                updated_at = NOW()
            WHERE id = $3
        `, [
            inventoryId,
            inventory.vin_number || "",
            leadId
        ]);

        await client.query(`
            INSERT INTO activity_logs
            (lead_id, user_id, action, old_value, new_value, remarks)
            VALUES ($1,$2,$3,$4,$5,$6)
        `, [
            leadId,
            req.user.id,
            "VEHICLE_ALLOCATED",
            lead.allocated_inventory_id || "",
            inventoryId,
            `Vehicle allocated: ${inventory.model_name || "-"} ${inventory.variant_name || "-"} ${inventory.color_name || "-"} | VIN: ${inventory.vin_number || "-"} | Branch: ${inventory.branch_name || "-"}`
        ]);

        await client.query("COMMIT");

        res.json({
            message: "Vehicle allocated to lead successfully",
            allocation: {
                lead_id: leadId,
                inventory_id: inventoryId,
                vin_number: inventory.vin_number || "",
                customer_name: lead.name,
                model_name: inventory.model_name,
                variant_name: inventory.variant_name,
                color_name: inventory.color_name,
                branch_name: inventory.branch_name
            }
        });

    } catch (err) {
        await client.query("ROLLBACK");

        console.error("INVENTORY ALLOCATION ERROR:", err);

        res.status(500).json({
            message: "Failed to allocate vehicle to lead"
        });

    } finally {
        client.release();
    }
});

/* DEACTIVATE INVENTORY UNIT */
router.delete("/:id", auth, requireInventoryManage, async (req, res) => {
    try {
        const id = parseId(req.params.id);

        if (Number.isNaN(id) || !id) {
            return res.status(400).json({ message: "Invalid inventory id" });
        }

        const values = [id];
        const clauses = ["i.id = $1"];

        appendCategoryScope(req, clauses, values, "i");
        appendBranchScope(req, clauses, values, "i");

        const result = await db.query(`
            UPDATE vehicle_inventory_units i
            SET 
                status = 'INACTIVE',
                updated_by = $${values.length + 1},
                updated_at = NOW()
            WHERE ${clauses.join(" AND ")}
            RETURNING id
        `, [...values, req.user.id]);

        if (!result.rows.length) {
            return res.status(404).json({
                message: "Inventory vehicle not found or not accessible"
            });
        }

        res.json({ message: "Inventory vehicle deactivated" });

    } catch (err) {
        console.error("INVENTORY DELETE ERROR:", err);
        res.status(500).json({ message: "Failed to deactivate inventory vehicle" });
    }
});

/* INVENTORY DASHBOARD SUMMARY */
router.get("/summary/dashboard", auth, requireInventoryView, async (req, res) => {
    try {
        const clauses = ["i.status = 'ACTIVE'"];
        const values = [];

        appendCategoryScope(req, clauses, values, "i");
        appendBranchScope(req, clauses, values, "i");

        const where = `WHERE ${clauses.join(" AND ")}`;

        const result = await db.query(`
            SELECT
                COUNT(*)::int AS total_units,
                COUNT(*) FILTER (WHERE i.vehicle_status = 'AVAILABLE')::int AS available_units,
                COUNT(*) FILTER (WHERE i.vehicle_status = 'IN_TRANSIT')::int AS in_transit_units,
                COUNT(*) FILTER (WHERE i.vehicle_status = 'OEM_BILLED')::int AS oem_billed_units,
                COUNT(*) FILTER (WHERE i.vehicle_status = 'ALLOCATED_TO_CUSTOMER')::int AS allocated_units,
                COUNT(*) FILTER (WHERE i.vehicle_status = 'RETAIL_DONE')::int AS retail_done_units,
                COUNT(*) FILTER (WHERE i.vehicle_status = 'DELIVERED')::int AS delivered_units,
                COUNT(*) FILTER (WHERE i.pdi_status = 'PDI_PENDING')::int AS pdi_pending_units,
                COUNT(*) FILTER (WHERE i.delivery_date IS NULL AND i.retail_date IS NOT NULL)::int AS retail_not_delivered
            FROM vehicle_inventory_units i
            ${where}
        `, values);

        const byModel = await db.query(`
            SELECT
                m.model_name,
                COUNT(*)::int AS count
            FROM vehicle_inventory_units i
            LEFT JOIN vehicle_models m ON m.id = i.model_id
            ${where}
            GROUP BY m.model_name
            ORDER BY count DESC
            LIMIT 10
        `, values);

        res.json({
            overview: result.rows[0],
            by_model: byModel.rows
        });

    } catch (err) {
        console.error("INVENTORY DASHBOARD ERROR:", err);
        res.status(500).json({ message: "Failed to load inventory summary" });
    }
});

module.exports = router;