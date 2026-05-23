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

function requireBookingView(req, res, next) {
    if (
        isAdminUser(req) ||
        req.user?.can_view === true ||
        hasPermission(req, "bookings.view")
    ) {
        return next();
    }

    return res.status(403).json({
        message: "You do not have permission to view bookings"
    });
}

function requireBookingManage(req, res, next) {
    if (
        isAdminUser(req) ||
        req.user?.can_edit === true ||
        hasPermission(req, "bookings.manage")
    ) {
        return next();
    }

    return res.status(403).json({
        message: "You do not have permission to manage bookings"
    });
}

function parseId(value) {
    if (value === "" || value === null || value === undefined) return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

function parseAmount(value) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function bool(value) {
    return value === true || value === "true" || value === 1 || value === "1";
}

function nullableDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : value;
}

function normalizeStatus(value, fallback, allowed) {
    const status = cleanText(value || fallback)
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

    return allowed.includes(status) ? status : fallback;
}

function bookingStatus(value) {
    return normalizeStatus(value, "BOOKED", [
        "BOOKED",
        "ADVANCE_RECEIVED",
        "VEHICLE_ALLOCATED",
        "FINANCE_PENDING",
        "RETAIL_PENDING",
        "RETAILED",
        "DELIVERED",
        "CANCELLED"
    ]);
}

function loanStatus(value) {
    return normalizeStatus(value, "NOT_REQUIRED", [
        "NOT_REQUIRED",
        "PENDING",
        "DOCUMENT_COLLECTED",
        "LOGIN_DONE",
        "APPROVED",
        "REJECTED",
        "DISBURSED"
    ]);
}

function simpleStatus(value, fallback = "PENDING") {
    return normalizeStatus(value, fallback, [
        "NOT_REQUIRED",
        "PENDING",
        "IN_PROGRESS",
        "COMPLETED",
        "REJECTED",
        "CANCELLED"
    ]);
}

function retailStatus(value) {
    return normalizeStatus(value, "PENDING", [
        "PENDING",
        "APPROVED",
        "INVOICED",
        "RETAILED",
        "CANCELLED"
    ]);
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

async function logLeadActivity(client, payload) {
    return auditLogActivity({
        ...payload,
        module_name: payload.module_name || "BOOKINGS",
        entity_type: payload.entity_type || "BOOKING",
        entity_id: payload.entity_id || payload.booking_id || payload.lead_id || null
    });
}


async function assertNoActiveBookingConflict(client, { leadId = null, inventoryId = null, excludeBookingId = null }) {
    const values = [];
    const clauses = ["COALESCE(booking_status,'BOOKED') NOT IN ('CANCELLED','DELIVERED')"];

    if (leadId) {
        values.push(leadId);
        clauses.push(`lead_id = $${values.length}`);
    }

    if (inventoryId) {
        values.push(inventoryId);
        clauses.push(`inventory_id = $${values.length}`);
    }

    if (excludeBookingId) {
        values.push(excludeBookingId);
        clauses.push(`id <> $${values.length}`);
    }

    if (!leadId && !inventoryId) return null;

    const result = await client.query(`
        SELECT id, booking_no, lead_id, inventory_id, booking_status
        FROM bookings
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT 1
    `, values);

    return result.rows[0] || null;
}

async function generateBookingNo(client) {
    const today = new Date();
    const prefix = `BK${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

    const result = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM bookings
        WHERE booking_no LIKE $1
    `, [`${prefix}%`]);

    const next = Number(result.rows[0]?.count || 0) + 1;
    return `${prefix}-${String(next).padStart(4, "0")}`;
}

/* LIST BOOKINGS */
router.get("/", auth, requireBookingView, async (req, res) => {
    try {
        const clauses = ["1=1"];
        const values = [];

        appendCategoryScope(req, clauses, values, "i");
        appendBranchScope(req, clauses, values, "i");

        if (req.query.booking_status) {
            values.push(bookingStatus(req.query.booking_status));
            clauses.push(`b.booking_status = $${values.length}`);
        }

        if (req.query.retail_status) {
            values.push(retailStatus(req.query.retail_status));
            clauses.push(`b.retail_status = $${values.length}`);
        }

        if (req.query.search) {
            values.push(`%${cleanText(req.query.search).toLowerCase()}%`);
            clauses.push(`(
                LOWER(COALESCE(b.booking_no,'')) LIKE $${values.length}
                OR LOWER(COALESCE(b.receipt_no,'')) LIKE $${values.length}
                OR LOWER(COALESCE(l.name,'')) LIKE $${values.length}
                OR LOWER(COALESCE(l.phone,'')) LIKE $${values.length}
                OR LOWER(COALESCE(i.vin_number,'')) LIKE $${values.length}
                OR LOWER(COALESCE(m.model_name,'')) LIKE $${values.length}
                OR LOWER(COALESCE(v.variant_name,'')) LIKE $${values.length}
            )`);
        }

        const result = await db.query(`
            SELECT
                b.*,
                l.name AS customer_name,
                l.phone AS customer_phone,
                l.status AS lead_status,

                i.vin_number,
                i.vehicle_category,
                i.vehicle_status,
                i.branch_id,

                m.model_name,
                v.variant_name,
                c.color_name,
                br.branch_name,
                br.branch_code,

                u1.name AS created_by_name,
                u2.name AS updated_by_name

            FROM bookings b
            LEFT JOIN leads l ON l.id = b.lead_id
            LEFT JOIN vehicle_inventory_units i ON i.id = b.inventory_id
            LEFT JOIN vehicle_models m ON m.id = i.model_id
            LEFT JOIN vehicle_variants v ON v.id = i.variant_id
            LEFT JOIN vehicle_colors c ON c.id = i.color_id
            LEFT JOIN branches br ON br.id = i.branch_id
            LEFT JOIN users u1 ON u1.id = b.created_by
            LEFT JOIN users u2 ON u2.id = b.updated_by
            WHERE ${clauses.join(" AND ")}
            ORDER BY b.updated_at DESC, b.id DESC
            LIMIT 500
        `, values);

        res.json(result.rows);

    } catch (err) {
        console.error("BOOKINGS LIST ERROR:", err);
        res.status(500).json({ message: "Failed to load bookings" });
    }
});

/* CREATE BOOKING */
router.post("/", auth, requireBookingManage, async (req, res) => {
    const client = await db.connect();

    try {
        const leadId = parseId(req.body.lead_id);
        const inventoryId = parseId(req.body.inventory_id);

        if (Number.isNaN(leadId) || Number.isNaN(inventoryId) || !leadId) {
            return res.status(400).json({
                message: "Valid lead id is required"
            });
        }

        await client.query("BEGIN");

        const leadResult = await client.query(`
            SELECT id, name, phone, status, allocated_inventory_id
            FROM leads
            WHERE id = $1
            FOR UPDATE
        `, [leadId]);

        if (!leadResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Lead not found" });
        }

        const finalInventoryId = inventoryId || leadResult.rows[0].allocated_inventory_id || null;

        const finalRetailStatus = retailStatus(req.body.retail_status);

        if (!finalInventoryId) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Vehicle allocation is required before creating booking"
            });
        }

        const activeLeadBooking = await assertNoActiveBookingConflict(client, {
            leadId,
            excludeBookingId: null
        });

        if (activeLeadBooking) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: `This lead already has an active booking: ${activeLeadBooking.booking_no || activeLeadBooking.id}`
            });
        }

        const activeInventoryBooking = await assertNoActiveBookingConflict(client, {
            inventoryId: finalInventoryId,
            excludeBookingId: null
        });

        if (activeInventoryBooking) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: `This vehicle already has an active booking: ${activeInventoryBooking.booking_no || activeInventoryBooking.id}`
            });
        }

        let inventory = null;

        if (finalInventoryId) {
            const accessValues = [finalInventoryId];
            const accessClauses = ["i.id = $1", "i.status = 'ACTIVE'"];

            appendCategoryScope(req, accessClauses, accessValues, "i");
            appendBranchScope(req, accessClauses, accessValues, "i");

            const inventoryResult = await client.query(`
                SELECT
                    i.*,
                    m.model_name,
                    v.variant_name,
                    c.color_name
                FROM vehicle_inventory_units i
                LEFT JOIN vehicle_models m ON m.id = i.model_id
                LEFT JOIN vehicle_variants v ON v.id = i.variant_id
                LEFT JOIN vehicle_colors c ON c.id = i.color_id
                WHERE ${accessClauses.join(" AND ")}
                FOR UPDATE
            `, accessValues);

            if (!inventoryResult.rows.length) {
                await client.query("ROLLBACK");
                return res.status(404).json({
                    message: "Inventory vehicle not found or not accessible"
                });
            }

            inventory = inventoryResult.rows[0];

            if (
                inventory.allocated_lead_id &&
                Number(inventory.allocated_lead_id) !== Number(leadId)
            ) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    message: "Inventory vehicle already allocated to another lead"
                });
            }
        }

        const bookingNo = cleanText(req.body.booking_no) || await generateBookingNo(client);

        const result = await client.query(`
            INSERT INTO bookings
            (
                lead_id,
                inventory_id,
                booking_no,
                booking_date,
                booking_amount,
                receipt_no,
                booking_status,
                finance_required,
                finance_partner,
                loan_status,
                insurance_required,
                insurance_partner,
                insurance_status,
                exchange_required,
                exchange_vehicle_details,
                exchange_status,
                retail_status,
                retail_invoice_no,
                retail_date,
                remarks,
                created_by,
                updated_by
            )
            VALUES
            (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
            )
            RETURNING *
        `, [
            leadId,
            finalInventoryId,
            bookingNo,
            nullableDate(req.body.booking_date) || new Date(),
            parseAmount(req.body.booking_amount),
            cleanText(req.body.receipt_no),
            bookingStatus(req.body.booking_status || "BOOKED"),
            bool(req.body.finance_required),
            cleanText(req.body.finance_partner),
            loanStatus(req.body.loan_status),
            req.body.insurance_required === undefined ? true : bool(req.body.insurance_required),
            cleanText(req.body.insurance_partner),
            simpleStatus(req.body.insurance_status, "PENDING"),
            bool(req.body.exchange_required),
            cleanText(req.body.exchange_vehicle_details),
            simpleStatus(req.body.exchange_status, "NOT_REQUIRED"),
            finalRetailStatus,
            cleanText(req.body.retail_invoice_no),
            nullableDate(req.body.retail_date),
            cleanText(req.body.remarks),
            req.user.id,
            req.user.id
        ]);

        if (inventoryId) {
            await client.query(`
                UPDATE vehicle_inventory_units
                SET
                    allocated_lead_id = COALESCE(allocated_lead_id, $1),
                    allocated_customer_name = COALESCE(NULLIF(allocated_customer_name, ''), $2),
                    booking_id = $3,
                    vehicle_status = CASE
                        WHEN vehicle_status NOT IN ('DELIVERED','RETAIL_DONE')
                        THEN 'ALLOCATED_TO_CUSTOMER'
                        ELSE vehicle_status
                    END,
                    updated_by = $4,
                    updated_at = NOW()
                WHERE id = $5
            `, [
                leadId,
                leadResult.rows[0].name,
                result.rows[0].id,
                req.user.id,
                finalInventoryId
            ]);

            await client.query(`
                UPDATE leads
                SET
                    allocated_inventory_id = COALESCE(allocated_inventory_id, $1),
                    allocated_vin_number = COALESCE(NULLIF(allocated_vin_number, ''), $2),
                    vehicle_allocated_at = COALESCE(vehicle_allocated_at, NOW()),
                    vehicle_allocation_status = 'ALLOCATED',
                    status = 'BOOKED',
                    updated_at = NOW()
                WHERE id = $3
            `, [
                finalInventoryId,
                inventory?.vin_number || "",
                leadId
            ]);
        } else {
            await client.query(`
                UPDATE leads
                SET status = 'BOOKED', updated_at = NOW()
                WHERE id = $1
            `, [leadId]);
        }

        await logLeadActivity(client, {
            lead_id: leadId,
            user_id: req.user.id,
            action: "BOOKING_CREATED",
            new_value: bookingNo,
            remarks: `Booking created. Amount: ${parseAmount(req.body.booking_amount)} Receipt: ${cleanText(req.body.receipt_no) || "-"}`
        });

        await client.query("COMMIT");

        res.status(201).json({
            message: "Booking created successfully",
            booking: result.rows[0]
        });

    } catch (err) {
        await client.query("ROLLBACK");

        console.error("BOOKING CREATE ERROR:", err);

        if (err.code === "23505") {
            return res.status(400).json({
                message: "Booking number already exists"
            });
        }

        res.status(500).json({ message: "Failed to create booking" });

    } finally {
        client.release();
    }
});


/* BOOKING ALLOCATION QUEUE */
router.get("/pending-allocation", auth, requireBookingView, async (req, res) => {
    try {
        const clauses = [
            "COALESCE(b.booking_status,'BOOKED') NOT IN ('CANCELLED','DELIVERED')",
            "b.inventory_id IS NULL"
        ];
        const values = [];

        appendBranchScope(req, clauses, values, "l");
        appendCategoryScope(req, clauses, values, "l");

        const result = await db.query(`
            SELECT
                b.*,
                l.name AS customer_name,
                l.phone AS customer_phone,
                l.car_interest,
                l.variant_interest,
                l.vehicle_category,
                l.preferred_color,
                l.fuel_type,
                l.vehicle_allocation_status,
                u.name AS sales_person_name,
                br.branch_name
            FROM bookings b
            LEFT JOIN leads l ON l.id = b.lead_id
            LEFT JOIN users u ON u.id = l.assigned_to
            LEFT JOIN branches br ON br.id = COALESCE(l.branch_id, l.assigned_branch_id)
            WHERE ${clauses.join(" AND ")}
            ORDER BY b.created_at DESC
            LIMIT 300
        `, values);

        res.json(result.rows);
    } catch (err) {
        console.error("BOOKING PENDING ALLOCATION ERROR:", err);
        res.status(500).json({ message: "Failed to load pending allocation bookings" });
    }
});

router.get("/:id/available-inventory", auth, requireBookingView, async (req, res) => {
    try {
        const bookingId = parseId(req.params.id);
        if (!bookingId) return res.status(400).json({ message: "Invalid booking id" });

        const bookingResult = await db.query(`
            SELECT b.*, l.vehicle_category, l.car_interest, l.variant_interest, l.preferred_color, l.fuel_type, l.branch_id, l.assigned_branch_id
            FROM bookings b
            LEFT JOIN leads l ON l.id = b.lead_id
            WHERE b.id=$1
            LIMIT 1
        `, [bookingId]);

        if (!bookingResult.rows.length) return res.status(404).json({ message: "Booking not found" });

        const booking = bookingResult.rows[0];
        const values = [];
        const clauses = [
            "COALESCE(i.vehicle_status,'AVAILABLE') NOT IN ('DELIVERED','RETAIL_DONE','ALLOCATED_TO_CUSTOMER')",
            "COALESCE(i.status,'ACTIVE')='ACTIVE'"
        ];

        if (booking.vehicle_category) {
            values.push(booking.vehicle_category);
            clauses.push(`i.vehicle_category=$${values.length}`);
        }

        if (booking.car_interest) {
            values.push(booking.car_interest);
            clauses.push(`LOWER(m.model_name)=LOWER($${values.length})`);
        }

        if (booking.variant_interest) {
            values.push(booking.variant_interest);
            clauses.push(`LOWER(v.variant_name)=LOWER($${values.length})`);
        }

        if (booking.preferred_color) {
            values.push(booking.preferred_color);
            clauses.push(`LOWER(c.color_name)=LOWER($${values.length})`);
        }

        appendBranchScope(req, clauses, values, "i");
        appendCategoryScope(req, clauses, values, "i");

        const result = await db.query(`
            SELECT
                i.*,
                m.model_name,
                v.variant_name,
                c.color_name
            FROM vehicle_inventory_units i
            LEFT JOIN vehicle_models m ON m.id = i.model_id
            LEFT JOIN vehicle_variants v ON v.id = i.variant_id
            LEFT JOIN vehicle_colors c ON c.id = i.color_id
            WHERE ${clauses.join(" AND ")}
            ORDER BY i.created_at DESC
            LIMIT 100
        `, values);

        res.json(result.rows);
    } catch (err) {
        console.error("BOOKING AVAILABLE INVENTORY ERROR:", err);
        res.status(500).json({ message: "Failed to load available inventory" });
    }
});

router.post("/:id/allocate-inventory", auth, requireBookingManage, async (req, res) => {
    const client = await db.connect();

    try {
        const bookingId = parseId(req.params.id);
        const inventoryId = parseId(req.body.inventory_id);

        if (!bookingId || !inventoryId) {
            return res.status(400).json({ message: "Valid booking and inventory are required" });
        }

        await client.query("BEGIN");

        const bookingResult = await client.query(`
            SELECT b.*, l.name AS customer_name
            FROM bookings b
            LEFT JOIN leads l ON l.id = b.lead_id
            WHERE b.id=$1
            FOR UPDATE
        `, [bookingId]);

        if (!bookingResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Booking not found" });
        }

        const booking = bookingResult.rows[0];

        const conflict = await assertNoActiveBookingConflict(client, {
            inventoryId,
            excludeBookingId: bookingId
        });

        if (conflict) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: `Vehicle already linked with active booking: ${conflict.booking_no || conflict.id}`
            });
        }

        const inventoryResult = await client.query(`
            SELECT *
            FROM vehicle_inventory_units
            WHERE id=$1
            AND COALESCE(status,'ACTIVE')='ACTIVE'
            FOR UPDATE
        `, [inventoryId]);

        if (!inventoryResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Inventory vehicle not found" });
        }

        const inventory = inventoryResult.rows[0];

        if (inventory.allocated_lead_id && Number(inventory.allocated_lead_id) !== Number(booking.lead_id)) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Vehicle already allocated to another lead" });
        }

        const updatedBooking = await client.query(`
            UPDATE bookings
            SET inventory_id=$1,
                booking_status='VEHICLE_ALLOCATED',
                updated_by=$2,
                updated_at=NOW()
            WHERE id=$3
            RETURNING *
        `, [inventoryId, req.user.id, bookingId]);

        await client.query(`
            UPDATE vehicle_inventory_units
            SET allocated_lead_id=$1,
                allocated_customer_name=$2,
                booking_id=$3,
                vehicle_status='ALLOCATED_TO_CUSTOMER',
                updated_by=$4,
                updated_at=NOW()
            WHERE id=$5
        `, [
            booking.lead_id,
            booking.customer_name || "",
            bookingId,
            req.user.id,
            inventoryId
        ]);

        await client.query(`
            UPDATE leads
            SET allocated_inventory_id=$1,
                allocated_vin_number=$2,
                vehicle_allocated_at=NOW(),
                vehicle_allocation_status='ALLOCATED',
                status='BOOKED',
                updated_at=NOW()
            WHERE id=$3
        `, [
            inventoryId,
            inventory.vin_number || "",
            booking.lead_id
        ]);

        await logLeadActivity(client, {
            lead_id: booking.lead_id,
            user_id: req.user.id,
            action: "VEHICLE_ALLOCATED_TO_BOOKING",
            booking_id: bookingId,
            new_value: inventory.vin_number || String(inventoryId),
            remarks: `Vehicle allocated to booking ${booking.booking_no}`
        });

        await client.query("COMMIT");

        res.json({
            message: "Vehicle allocated to booking successfully",
            booking: updatedBooking.rows[0]
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("BOOKING ALLOCATE INVENTORY ERROR:", err);
        res.status(500).json({ message: "Failed to allocate vehicle to booking" });
    } finally {
        client.release();
    }
});


/* UPDATE BOOKING */
router.put("/:id", auth, requireBookingManage, async (req, res) => {
    const client = await db.connect();

    try {
        const bookingId = parseId(req.params.id);
        const inventoryId = parseId(req.body.inventory_id);

        if (Number.isNaN(bookingId) || Number.isNaN(inventoryId) || !bookingId) {
            return res.status(400).json({
                message: "Invalid booking or inventory id"
            });
        }

        await client.query("BEGIN");

        const existing = await client.query(`
            SELECT b.*
            FROM bookings b
            LEFT JOIN vehicle_inventory_units i ON i.id = b.inventory_id
            WHERE b.id = $1
            FOR UPDATE
        `, [bookingId]);

        if (!existing.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Booking not found" });
        }

        const oldBooking = existing.rows[0];

        const finalRetailStatus = retailStatus(req.body.retail_status);

        if (["INVOICED", "RETAILED"].includes(finalRetailStatus) && !inventoryId) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Retail cannot be completed without allocated inventory"
            });
        }

        if (inventoryId) {
            const activeInventoryBooking = await assertNoActiveBookingConflict(client, {
                inventoryId,
                excludeBookingId: bookingId
            });

            if (activeInventoryBooking) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    message: `This vehicle already has another active booking: ${activeInventoryBooking.booking_no || activeInventoryBooking.id}`
                });
            }
        }

        const result = await client.query(`
            UPDATE bookings
            SET
                inventory_id = $1,
                booking_date = $2,
                booking_amount = $3,
                receipt_no = $4,
                booking_status = $5,
                finance_required = $6,
                finance_partner = $7,
                loan_status = $8,
                insurance_required = $9,
                insurance_partner = $10,
                insurance_status = $11,
                exchange_required = $12,
                exchange_vehicle_details = $13,
                exchange_status = $14,
                retail_status = $15,
                retail_invoice_no = $16,
                retail_date = $17,
                remarks = $18,
                updated_by = $19,
                updated_at = NOW()
            WHERE id = $20
            RETURNING *
        `, [
            inventoryId,
            nullableDate(req.body.booking_date) || oldBooking.booking_date,
            parseAmount(req.body.booking_amount),
            cleanText(req.body.receipt_no),
            bookingStatus(req.body.booking_status),
            bool(req.body.finance_required),
            cleanText(req.body.finance_partner),
            loanStatus(req.body.loan_status),
            req.body.insurance_required === undefined ? true : bool(req.body.insurance_required),
            cleanText(req.body.insurance_partner),
            simpleStatus(req.body.insurance_status, "PENDING"),
            bool(req.body.exchange_required),
            cleanText(req.body.exchange_vehicle_details),
            simpleStatus(req.body.exchange_status, "NOT_REQUIRED"),
            retailStatus(req.body.retail_status),
            cleanText(req.body.retail_invoice_no),
            nullableDate(req.body.retail_date),
            cleanText(req.body.remarks),
            req.user.id,
            bookingId
        ]);

        const booking = result.rows[0];

        if (inventoryId) {
            await client.query(`
                UPDATE vehicle_inventory_units
                SET
                    retail_date = CASE WHEN $1 IS NOT NULL THEN $1 ELSE retail_date END,
                    customer_invoice_no = CASE WHEN $2 <> '' THEN $2 ELSE customer_invoice_no END,
                    vehicle_status = CASE
                        WHEN $3 IN ('INVOICED','RETAILED') THEN 'RETAIL_DONE'
                        WHEN vehicle_status NOT IN ('DELIVERED','RETAIL_DONE') THEN 'ALLOCATED_TO_CUSTOMER'
                        ELSE vehicle_status
                    END,
                    updated_by = $4,
                    updated_at = NOW()
                WHERE id = $5
            `, [
                booking.retail_date,
                booking.retail_invoice_no || "",
                booking.retail_status,
                req.user.id,
                inventoryId
            ]);
        }

        if (booking.retail_status === "RETAILED" || booking.retail_status === "INVOICED") {
            await client.query(`
                UPDATE leads
                SET status = 'CLOSED', updated_at = NOW()
                WHERE id = $1
            `, [booking.lead_id]);
        }

        await logLeadActivity(client, {
            lead_id: booking.lead_id,
            user_id: req.user.id,
            action: "BOOKING_UPDATED",
            old_value: oldBooking.booking_status,
            new_value: booking.booking_status,
            remarks: `Booking updated. Retail status: ${booking.retail_status}`
        });

        await client.query("COMMIT");

        res.json({
            message: "Booking updated successfully",
            booking
        });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("BOOKING UPDATE ERROR:", err);
        res.status(500).json({ message: "Failed to update booking" });

    } finally {
        client.release();
    }
});

/* GET BOOKING BY LEAD */
router.get("/lead/:leadId", auth, requireBookingView, async (req, res) => {
    try {
        const leadId = parseId(req.params.leadId);

        if (Number.isNaN(leadId) || !leadId) {
            return res.status(400).json({ message: "Invalid lead id" });
        }

        const result = await db.query(`
            SELECT *
            FROM bookings
            WHERE lead_id = $1
            ORDER BY created_at DESC
            LIMIT 1
        `, [leadId]);

        res.json(result.rows[0] || null);

    } catch (err) {
        console.error("BOOKING BY LEAD ERROR:", err);
        res.status(500).json({ message: "Failed to load lead booking" });
    }
});

/* BOOKING SUMMARY */
router.get("/summary/dashboard", auth, requireBookingView, async (req, res) => {
    try {
        const clauses = ["1=1"];
        const values = [];

        appendCategoryScope(req, clauses, values, "i");
        appendBranchScope(req, clauses, values, "i");

        const result = await db.query(`
            SELECT
                COUNT(*)::int AS total_bookings,
                COALESCE(SUM(booking_amount),0)::numeric AS total_booking_amount,
                COUNT(*) FILTER (WHERE booking_status = 'BOOKED')::int AS booked,
                COUNT(*) FILTER (WHERE booking_status = 'CANCELLED')::int AS cancelled,
                COUNT(*) FILTER (WHERE retail_status IN ('INVOICED','RETAILED'))::int AS retailed,
                COUNT(*) FILTER (WHERE loan_status IN ('PENDING','DOCUMENT_COLLECTED','LOGIN_DONE'))::int AS finance_pending,
                COUNT(*) FILTER (WHERE insurance_status = 'PENDING')::int AS insurance_pending,
                COUNT(*) FILTER (WHERE exchange_status = 'PENDING')::int AS exchange_pending
            FROM bookings b
            LEFT JOIN vehicle_inventory_units i ON i.id = b.inventory_id
            WHERE ${clauses.join(" AND ")}
        `, values);

        res.json(result.rows[0]);

    } catch (err) {
        console.error("BOOKING SUMMARY ERROR:", err);
        res.status(500).json({ message: "Failed to load booking summary" });
    }
});

module.exports = router;