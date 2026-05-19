const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");
const { logActivity: auditLogActivity } = require("../utils/activityLogger");

function cleanText(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
}

function isAdminUser(req) {
    return ["admin", "super_admin", "owner", "director", "ceo"].includes(normalizeRole(req.user?.role));
}

function hasPermission(req, key) {
    if (isAdminUser(req)) return true;

    const permissions = Array.isArray(req.user?.permissions)
        ? req.user.permissions
        : [];

    return permissions.includes(key);
}

function requireDeliveryView(req, res, next) {
    if (
        isAdminUser(req) ||
        req.user?.can_view === true ||
        hasPermission(req, "delivery.view")
    ) {
        return next();
    }

    return res.status(403).json({
        message: "You do not have permission to view delivery checklist"
    });
}

function requireDeliveryManage(req, res, next) {
    if (
        isAdminUser(req) ||
        req.user?.can_edit === true ||
        hasPermission(req, "delivery.manage")
    ) {
        return next();
    }

    return res.status(403).json({
        message: "You do not have permission to manage delivery checklist"
    });
}

function parseId(value) {
    if (value === "" || value === null || value === undefined) return null;

    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

function bool(value) {
    return value === true || value === "true" || value === 1 || value === "1";
}

function nullableDate(value) {
    if (!value) return null;

    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : value;
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

    if (
        ["BRANCH", "DEPARTMENT", "TEAM", "VIEW_ONLY"].includes(dataScope) &&
        req.user?.branch_id
    ) {
        values.push(req.user.branch_id);
        clauses.push(`${alias}.branch_id = $${values.length}`);
    }
}

function calculateDeliveryScore(data) {
    const fields = [
        "pdi_completed",
        "accessories_completed",
        "finance_completed",
        "insurance_completed",
        "rto_completed",
        "fastag_completed",
        "payment_completed",
        "invoice_completed",
        "delivery_photo_uploaded",
        "customer_confirmation"
    ];

    const completed = fields.filter(field => bool(data[field])).length;
    return Math.round((completed / fields.length) * 100);
}

function calculateDeliveryStatus(score, blockerReason = "") {
    if (blockerReason) return "BLOCKED";
    if (score >= 100) return "READY";
    if (score >= 70) return "NEAR_READY";
    return "PENDING";
}

/* LIST DELIVERY CHECKLISTS */
router.get("/", auth, requireDeliveryView, async (req, res) => {
    try {
        const clauses = ["1=1"];
        const values = [];

        appendCategoryScope(req, clauses, values, "i");
        appendBranchScope(req, clauses, values, "i");

        if (req.query.delivery_status) {
            values.push(cleanText(req.query.delivery_status).toUpperCase());
            clauses.push(`d.delivery_status = $${values.length}`);
        }

        if (req.query.branch_id) {
            const branchId = parseId(req.query.branch_id);

            if (Number.isNaN(branchId)) {
                return res.status(400).json({
                    message: "Invalid branch filter"
                });
            }

            if (branchId) {
                values.push(branchId);
                clauses.push(`i.branch_id = $${values.length}`);
            }
        }

        if (req.query.search) {
            values.push(`%${cleanText(req.query.search).toLowerCase()}%`);
            clauses.push(`(
                LOWER(COALESCE(i.vin_number, '')) LIKE $${values.length}
                OR LOWER(COALESCE(i.chassis_number, '')) LIKE $${values.length}
                OR LOWER(COALESCE(l.name, '')) LIKE $${values.length}
                OR LOWER(COALESCE(l.phone, '')) LIKE $${values.length}
                OR LOWER(COALESCE(m.model_name, '')) LIKE $${values.length}
                OR LOWER(COALESCE(v.variant_name, '')) LIKE $${values.length}
            )`);
        }

        const result = await db.query(`
            SELECT
                d.*,
                i.vin_number,
                i.chassis_number,
                i.engine_number,
                i.vehicle_category,
                i.vehicle_status,
                i.branch_id,
                i.delivery_date AS inventory_delivery_date,

                m.model_name,
                v.variant_name,
                c.color_name,
                b.branch_name,
                b.branch_code,

                l.name AS customer_name,
                l.phone AS customer_phone,
                l.status AS lead_status,

                u1.name AS created_by_name,
                u2.name AS updated_by_name

            FROM delivery_checklists d
            LEFT JOIN vehicle_inventory_units i ON i.id = d.inventory_id
            LEFT JOIN vehicle_models m ON m.id = i.model_id
            LEFT JOIN vehicle_variants v ON v.id = i.variant_id
            LEFT JOIN vehicle_colors c ON c.id = i.color_id
            LEFT JOIN branches b ON b.id = i.branch_id
            LEFT JOIN leads l ON l.id = d.lead_id
            LEFT JOIN users u1 ON u1.id = d.created_by
            LEFT JOIN users u2 ON u2.id = d.updated_by
            WHERE ${clauses.join(" AND ")}
            ORDER BY d.updated_at DESC, d.id DESC
            LIMIT 500
        `, values);

        res.json(result.rows);

    } catch (err) {
        console.error("DELIVERY LIST ERROR:", err);
        res.status(500).json({
            message: "Failed to load delivery checklist"
        });
    }
});

/* CREATE OR UPDATE DELIVERY CHECKLIST */
router.post("/", auth, requireDeliveryManage, async (req, res) => {
    try {
        const inventoryId = parseId(req.body.inventory_id);
        const leadId = parseId(req.body.lead_id);

        if (Number.isNaN(inventoryId) || !inventoryId || Number.isNaN(leadId)) {
            return res.status(400).json({
                message: "Valid inventory id is required"
            });
        }

        const accessValues = [inventoryId];
        const accessClauses = [
            "i.id = $1",
            "i.status = 'ACTIVE'"
        ];

        appendCategoryScope(req, accessClauses, accessValues, "i");
        appendBranchScope(req, accessClauses, accessValues, "i");

        const inventoryCheck = await db.query(`
            SELECT i.id, i.allocated_lead_id, i.vehicle_status
            FROM vehicle_inventory_units i
            WHERE ${accessClauses.join(" AND ")}
            LIMIT 1
        `, accessValues);

        if (!inventoryCheck.rows.length) {
            return res.status(404).json({
                message: "Inventory vehicle not found or not accessible"
            });
        }

        const inventory = inventoryCheck.rows[0];

        const finalLeadId = leadId || inventory.allocated_lead_id || null;

        if (nullableDate(req.body.actual_delivery_date)) {
            const bookingCheck = await db.query(`
                SELECT id, booking_no, retail_status
                FROM bookings
                WHERE inventory_id = $1
                AND lead_id = COALESCE($2, lead_id)
                AND booking_status <> 'CANCELLED'
                ORDER BY created_at DESC
                LIMIT 1
            `, [inventoryId, finalLeadId]);

            if (!bookingCheck.rows.length) {
                return res.status(400).json({
                    message: "Delivery cannot be completed before booking is created"
                });
            }

            if (!["INVOICED", "RETAILED"].includes(String(bookingCheck.rows[0].retail_status || "").toUpperCase())) {
                return res.status(400).json({
                    message: "Delivery cannot be completed before retail invoice / retail status"
                });
            }
        }

        const checklistData = {
            pdi_completed: bool(req.body.pdi_completed),
            accessories_completed: bool(req.body.accessories_completed),
            finance_completed: bool(req.body.finance_completed),
            insurance_completed: bool(req.body.insurance_completed),
            rto_completed: bool(req.body.rto_completed),
            fastag_completed: bool(req.body.fastag_completed),
            payment_completed: bool(req.body.payment_completed),
            invoice_completed: bool(req.body.invoice_completed),
            delivery_photo_uploaded: bool(req.body.delivery_photo_uploaded),
            customer_confirmation: bool(req.body.customer_confirmation)
        };

        const blockerReason = cleanText(req.body.blocker_reason);
        const score = calculateDeliveryScore(checklistData);
        const deliveryStatus = calculateDeliveryStatus(score, blockerReason);

        const result = await db.query(`
            INSERT INTO delivery_checklists
            (
                inventory_id,
                lead_id,
                pdi_completed,
                accessories_completed,
                finance_completed,
                insurance_completed,
                rto_completed,
                fastag_completed,
                payment_completed,
                invoice_completed,
                delivery_photo_uploaded,
                customer_confirmation,
                delivery_ready_score,
                delivery_status,
                planned_delivery_date,
                actual_delivery_date,
                blocker_reason,
                remarks,
                created_by,
                updated_by
            )
            VALUES
            (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17,$18,$19,$20
            )
            ON CONFLICT (inventory_id)
            DO UPDATE SET
                lead_id = EXCLUDED.lead_id,
                pdi_completed = EXCLUDED.pdi_completed,
                accessories_completed = EXCLUDED.accessories_completed,
                finance_completed = EXCLUDED.finance_completed,
                insurance_completed = EXCLUDED.insurance_completed,
                rto_completed = EXCLUDED.rto_completed,
                fastag_completed = EXCLUDED.fastag_completed,
                payment_completed = EXCLUDED.payment_completed,
                invoice_completed = EXCLUDED.invoice_completed,
                delivery_photo_uploaded = EXCLUDED.delivery_photo_uploaded,
                customer_confirmation = EXCLUDED.customer_confirmation,
                delivery_ready_score = EXCLUDED.delivery_ready_score,
                delivery_status = EXCLUDED.delivery_status,
                planned_delivery_date = EXCLUDED.planned_delivery_date,
                actual_delivery_date = EXCLUDED.actual_delivery_date,
                blocker_reason = EXCLUDED.blocker_reason,
                remarks = EXCLUDED.remarks,
                updated_by = EXCLUDED.updated_by,
                updated_at = NOW()
            RETURNING *
        `, [
            inventoryId,
            finalLeadId,
            checklistData.pdi_completed,
            checklistData.accessories_completed,
            checklistData.finance_completed,
            checklistData.insurance_completed,
            checklistData.rto_completed,
            checklistData.fastag_completed,
            checklistData.payment_completed,
            checklistData.invoice_completed,
            checklistData.delivery_photo_uploaded,
            checklistData.customer_confirmation,
            score,
            deliveryStatus,
            nullableDate(req.body.planned_delivery_date),
            nullableDate(req.body.actual_delivery_date),
            blockerReason,
            cleanText(req.body.remarks),
            req.user.id,
            req.user.id
        ]);

        if (deliveryStatus === "READY") {
            await db.query(`
                UPDATE vehicle_inventory_units
                SET 
                    vehicle_status = CASE 
                        WHEN vehicle_status NOT IN ('DELIVERED', 'RETAIL_DONE')
                        THEN 'PDI_DONE'
                        ELSE vehicle_status
                    END,
                    updated_by = $1,
                    updated_at = NOW()
                WHERE id = $2
            `, [req.user.id, inventoryId]);
        }

        if (nullableDate(req.body.actual_delivery_date)) {
            await db.query(`
                UPDATE vehicle_inventory_units
                SET 
                    vehicle_status = 'DELIVERED',
                    delivery_date = $1,
                    updated_by = $2,
                    updated_at = NOW()
                WHERE id = $3
            `, [
                nullableDate(req.body.actual_delivery_date),
                req.user.id,
                inventoryId
            ]);

            if (finalLeadId) {
                await db.query(`
                    UPDATE leads
                    SET 
                        status = 'CLOSED',
                        vehicle_allocation_status = 'DELIVERED',
                        updated_at = NOW()
                    WHERE id = $1
                `, [finalLeadId]);
            }
        }

        await auditLogActivity({
            req,
            user_id: req.user.id,
            lead_id: finalLeadId,
            action: "DELIVERY_CHECKLIST_SAVED",
            module_name: "DELIVERY",
            entity_type: "DELIVERY_CHECKLIST",
            entity_id: result.rows[0].id,
            new_value: deliveryStatus,
            severity: deliveryStatus === "BLOCKED" ? "WARNING" : "INFO",
            remarks: `Delivery checklist saved. Score: ${score}%. Status: ${deliveryStatus}.`
        });

        res.json({
            message: "Delivery checklist saved successfully",
            checklist: result.rows[0]
        });

    } catch (err) {
        console.error("DELIVERY SAVE ERROR:", err);
        res.status(500).json({
            message: "Failed to save delivery checklist"
        });
    }
});

/* GET CHECKLIST BY INVENTORY ID */
router.get("/inventory/:inventoryId", auth, requireDeliveryView, async (req, res) => {
    try {
        const inventoryId = parseId(req.params.inventoryId);

        if (Number.isNaN(inventoryId) || !inventoryId) {
            return res.status(400).json({
                message: "Invalid inventory id"
            });
        }

        const values = [inventoryId];
        const clauses = ["i.id = $1"];

        appendCategoryScope(req, clauses, values, "i");
        appendBranchScope(req, clauses, values, "i");

        const result = await db.query(`
            SELECT
                d.*,
                i.vin_number,
                i.chassis_number,
                i.vehicle_category,
                i.vehicle_status,
                i.allocated_lead_id,
                i.allocated_customer_name,

                m.model_name,
                v.variant_name,
                c.color_name,
                b.branch_name,
                b.branch_code,

                l.name AS customer_name,
                l.phone AS customer_phone

            FROM vehicle_inventory_units i
            LEFT JOIN delivery_checklists d ON d.inventory_id = i.id
            LEFT JOIN vehicle_models m ON m.id = i.model_id
            LEFT JOIN vehicle_variants v ON v.id = i.variant_id
            LEFT JOIN vehicle_colors c ON c.id = i.color_id
            LEFT JOIN branches b ON b.id = i.branch_id
            LEFT JOIN leads l ON l.id = COALESCE(d.lead_id, i.allocated_lead_id)
            WHERE ${clauses.join(" AND ")}
            LIMIT 1
        `, values);

        if (!result.rows.length) {
            return res.status(404).json({
                message: "Inventory vehicle not found or not accessible"
            });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error("DELIVERY BY INVENTORY ERROR:", err);
        res.status(500).json({
            message: "Failed to load delivery checklist"
        });
    }
});

/* DELIVERY DASHBOARD SUMMARY */
router.get("/summary/dashboard", auth, requireDeliveryView, async (req, res) => {
    try {
        const clauses = ["1=1"];
        const values = [];

        appendCategoryScope(req, clauses, values, "i");
        appendBranchScope(req, clauses, values, "i");

        const result = await db.query(`
            SELECT
                COUNT(*)::int AS total_checklists,
                COUNT(*) FILTER (WHERE d.delivery_status = 'READY')::int AS ready,
                COUNT(*) FILTER (WHERE d.delivery_status = 'NEAR_READY')::int AS near_ready,
                COUNT(*) FILTER (WHERE d.delivery_status = 'PENDING')::int AS pending,
                COUNT(*) FILTER (WHERE d.delivery_status = 'BLOCKED')::int AS blocked,
                ROUND(AVG(d.delivery_ready_score))::int AS avg_ready_score,
                COUNT(*) FILTER (
                    WHERE d.planned_delivery_date < CURRENT_DATE
                    AND d.actual_delivery_date IS NULL
                )::int AS overdue_deliveries
            FROM delivery_checklists d
            LEFT JOIN vehicle_inventory_units i ON i.id = d.inventory_id
            WHERE ${clauses.join(" AND ")}
        `, values);

        res.json(result.rows[0]);

    } catch (err) {
        console.error("DELIVERY DASHBOARD ERROR:", err);
        res.status(500).json({
            message: "Failed to load delivery summary"
        });
    }
});

module.exports = router;