const express = require("express");
const db = require("../config/db");
const sendWhatsApp = require("../services/whatsapp");
const { calculateScore, getLeadPriority } = require("../services/scoring");
const auth = require("../middleware/auth");

const router = express.Router();

const STATUSES = [
    "NEW",
    "CONTACTED",
    "FOLLOW-UP",
    "TEST-DRIVE",
    "BOOKED",
    "CLOSED",
    "LOST"
];

const ACTIONS = [
    "ENQUIRY",
    "QUICK_ENQUIRY",
    "COMPLETE_ENQUIRY",
    "TEST_DRIVE",
    "CALL",
    "WHATSAPP",
    "VISIT",
    "BOOKING"
];

const SOURCES = [
    "WEBSITE",
    "CALL_NOW",
    "WHATSAPP",
    "FACEBOOK",
    "INSTAGRAM",
    "GOOGLE_ADS",
    "MANUAL",
    "SHOWROOM"
];

function normalizePhone(phone) {
    return String(phone || "").replace(/\D/g, "").slice(-10);
}

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
}

function parseId(value) {
    if (value === "" || value === null || value === undefined) return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : NaN;
}

function cleanText(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function normalizeAction(value) {
    const action = String(value || "ENQUIRY")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

    return ACTIONS.includes(action) ? action : "ENQUIRY";
}

function normalizeSource(value) {
    const source = String(value || "WEBSITE")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

    return SOURCES.includes(source) ? source : source || "WEBSITE";
}

function nullableDate(value) {
    if (!value) return null;

    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/* =====================================================
   USER / PERMISSION HELPERS
===================================================== */
function isAdminUser(req) {
    if (req.user?.is_higher_authority === true) return true;

    return [
        "admin",
        "super_admin",
        "owner",
        "director",
        "ceo"
    ].includes(normalizeRole(req.user?.role));
}

function hasPermission(req, key) {
    if (isAdminUser(req)) return true;

    const permissions = Array.isArray(req.user?.permissions)
        ? req.user.permissions
        : [];

    return permissions.includes(key);
}

function hasFlag(req, flag) {
    if (isAdminUser(req)) return true;
    return req.user?.[flag] === true;
}

function requireAdmin(req, res, next) {
    if (!isAdminUser(req)) {
        return res.status(403).json({ message: "Admin access required" });
    }

    next();
}

function requireLeadView(req, res, next) {
    if (!hasFlag(req, "can_view") && !hasPermission(req, "leads.view")) {
        return res.status(403).json({
            message: "You do not have permission to view leads"
        });
    }

    next();
}

function requireLeadEdit(req, res, next) {
    if (!hasFlag(req, "can_edit") && !hasPermission(req, "leads.edit")) {
        return res.status(403).json({
            message: "You do not have permission to edit leads"
        });
    }

    next();
}

function requireLeadAssign(req, res, next) {
    if (!hasFlag(req, "can_assign") && !hasPermission(req, "leads.assign")) {
        return res.status(403).json({
            message: "You do not have permission to assign leads"
        });
    }

    next();
}

function requireLeadMonitor(req, res, next) {
    if (
        !isAdminUser(req) &&
        !hasFlag(req, "can_monitor") &&
        !hasPermission(req, "reports.view")
    ) {
        return res.status(403).json({
            message: "You do not have permission to monitor reports"
        });
    }

    next();
}

/*
    Data scope behavior:
    admin / ALL      -> all leads
    BRANCH           -> same branch leads
    DEPARTMENT       -> currently same branch leads
    TEAM             -> currently same branch leads
    VIEW_ONLY        -> same branch leads if branch exists, otherwise own leads
    OWN              -> assigned leads only
*/

function normalizeVehicleCategoryScope(value) {
    const scope = String(value || "ALL").trim().toUpperCase();
    return ["ALL", "AD", "EV"].includes(scope) ? scope : "ALL";
}

function appendVehicleCategoryScope(req, clauses, values, alias = "l") {
    if (isAdminUser(req)) return;

    const categoryScope = normalizeVehicleCategoryScope(req.user?.vehicle_category_scope);

    if (categoryScope === "ALL") return;

    values.push(categoryScope);
    clauses.push(`UPPER(COALESCE(${alias}.vehicle_category, '')) = $${values.length}`);
}

function appendLeadAccessScope(req, clauses, values, alias = "l") {
    if (isAdminUser(req)) return;

    const scope = String(req.user?.data_scope || "OWN").toUpperCase();

    if (scope === "ALL") {
        appendVehicleCategoryScope(req, clauses, values, alias);
        return;
    }

    if (
        ["BRANCH", "DEPARTMENT", "TEAM", "VIEW_ONLY"].includes(scope) &&
        req.user.branch_id
    ) {
        values.push(req.user.branch_id);
        clauses.push(`${alias}.branch_id = $${values.length}`);
        appendVehicleCategoryScope(req, clauses, values, alias);
        return;
    }

    values.push(req.user.id);
    clauses.push(`${alias}.assigned_to = $${values.length}`);
    appendVehicleCategoryScope(req, clauses, values, alias);
}

function leadAccessAndClause(req, values, alias = "l") {
    const clauses = [];
    appendLeadAccessScope(req, clauses, values, alias);
    return clauses.length ? `AND ${clauses.join(" AND ")}` : "";
}

/* =====================================================
   DATABASE HELPERS
===================================================== */
async function getDefaultBranchId() {
    const result = await db.query(`
        SELECT id
        FROM branches
        WHERE branch_code = 'MAIN'
        ORDER BY id ASC
        LIMIT 1
    `);

    return result.rows[0]?.id || null;
}

async function getUserBranchId(userId) {
    if (!userId) return null;

    const result = await db.query(`
        SELECT branch_id
        FROM users
        WHERE id = $1
        LIMIT 1
    `, [userId]);

    return result.rows[0]?.branch_id || null;
}

async function getLeastLoadedSalesUser(branchId = null) {
    const values = [];
    let branchClause = "";

    if (branchId) {
        values.push(branchId);
        branchClause = `AND u.branch_id = $${values.length}`;
    }

    const result = await db.query(`
        SELECT 
            u.id, 
            u.branch_id,
            COUNT(l.id)::int AS lead_count
        FROM users u
        LEFT JOIN leads l 
            ON l.assigned_to = u.id 
            AND l.status NOT IN ('CLOSED','LOST')
        WHERE LOWER(u.role) = 'sales'
        AND COALESCE(u.status, 'ACTIVE') = 'ACTIVE'
        ${branchClause}
        GROUP BY u.id, u.branch_id
        ORDER BY lead_count ASC, u.id ASC
        LIMIT 1
    `, values);

    return result.rows[0] || null;
}

async function logActivity({
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
        console.error("ACTIVITY LOG ERROR:", err.message);
    }
}


async function ensureLeadVerificationColumns() {
    await db.query(`
        ALTER TABLE leads
        ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) DEFAULT 'NOT_VERIFIED',
        ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS verification_remarks TEXT,
        ADD COLUMN IF NOT EXISTS verification_otp VARCHAR(10),
        ADD COLUMN IF NOT EXISTS verification_otp_expires_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS verification_otp_sent_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS verification_otp_attempts INTEGER DEFAULT 0
    `);
}

async function ensureLeadScopeColumns() {
    await db.query(`
        ALTER TABLE leads
        ADD COLUMN IF NOT EXISTS vehicle_category VARCHAR(20),
        ADD COLUMN IF NOT EXISTS branch_id INTEGER,
        ADD COLUMN IF NOT EXISTS assigned_branch_id INTEGER
    `);

    /*
        Compatibility fix for older lead records created before EV/AD scope.
        Without this, AD/EV scoped users may see an empty Leads page
        because old rows have NULL/blank vehicle_category.
    */
    await db.query(`
        UPDATE leads
        SET vehicle_category = 'AD'
        WHERE vehicle_category IS NULL OR TRIM(vehicle_category) = ''
    `);
}

function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function maskPhone(phone) {
    const p = normalizePhone(phone);
    if (p.length < 10) return p || "customer";
    return `XXXXXX${p.slice(-4)}`;
}

/* =====================================================
   CREATE LEAD - PUBLIC WEBSITE / SOCIAL / MANUAL API
===================================================== */
router.post("/lead", async (req, res) => {
    try {
        const data = req.body || {};
        const phone = normalizePhone(data.phone);
        const action = normalizeAction(data.action_type || data.lead_type);
        const source = normalizeSource(data.source || data.tracking?.utm_source || "WEBSITE");

        if (!data.name || phone.length !== 10) {
            return res.status(400).json({
                message: "Name and valid phone are required"
            });
        }

        const existingLead = await db.query(`
            SELECT 
                id, 
                name, 
                phone, 
                status, 
                assigned_to,
                branch_id
            FROM leads
            WHERE phone = $1
            ORDER BY created_at DESC
            LIMIT 1
        `, [phone]);

        if (existingLead.rows.length) {
            const duplicateLead = existingLead.rows[0];

            await db.query(`
                INSERT INTO lead_followups
                (
                    lead_id, 
                    user_id, 
                    followup_type, 
                    call_status, 
                    customer_response, 
                    remarks
                )
                VALUES ($1, NULL, 'SYSTEM', 'DUPLICATE_LEAD', 'Duplicate enquiry received', $2)
            `, [
                duplicateLead.id,
                `Duplicate lead received. Source: ${source}. Action: ${action}. Car: ${cleanText(data.car_interest, "Not Selected")}`
            ]);

            await db.query(`
                UPDATE leads
                SET 
                    updated_at = NOW(),
                    notes = COALESCE(notes, '') || $1
                WHERE id = $2
            `, [
                `\nDuplicate enquiry received from ${source} - ${new Date().toLocaleString("en-IN")}`,
                duplicateLead.id
            ]);

            await logActivity({
                lead_id: duplicateLead.id,
                user_id: null,
                action: "DUPLICATE_LEAD",
                old_value: duplicateLead.status,
                new_value: duplicateLead.status,
                remarks: `Duplicate enquiry received from ${source}. Action: ${action}.`
            });

            return res.status(200).json({
                message: "Duplicate lead updated as follow-up",
                duplicate: true,
                lead_id: duplicateLead.id,
                assigned_to: duplicateLead.assigned_to,
                branch_id: duplicateLead.branch_id
            });
        }

        const tracking = data.tracking || {};
        const score = calculateScore({
            ...data,
            phone,
            action_type: action,
            tracking
        });

        const priority = getLeadPriority(score).toUpperCase();
        const now = new Date();

        const requestedAssign = parseId(data.assigned_to || data.user_id);
        const requestedBranch = parseId(data.branch_id || data.assigned_branch_id);

        if (Number.isNaN(requestedAssign) || Number.isNaN(requestedBranch)) {
            return res.status(400).json({
                message: "Invalid assigned user or branch selected"
            });
        }

        let branchId = requestedBranch || await getDefaultBranchId();
        let assignedTo = null;

        if (Number.isInteger(requestedAssign)) {
            assignedTo = requestedAssign;

            const userBranchId = await getUserBranchId(assignedTo);
            if (userBranchId) branchId = userBranchId;

        } else {
            const leastLoadedUser = await getLeastLoadedSalesUser(branchId);

            if (leastLoadedUser) {
                assignedTo = leastLoadedUser.id;
                branchId = leastLoadedUser.branch_id || branchId;
            }
        }

        const result = await db.query(`
            INSERT INTO leads
            (
                name, 
                phone, 
                alternate_phone, 
                email, 
                area, 
                district, 
                profession, 
                family_members,
                vehicle_category, 
                fuel_type, 
                car_interest, 
                variant_interest, 
                budget_range, 
                purchase_timeline,
                exchange_vehicle, 
                finance_required, 
                action_type, 
                lead_type, 
                source, 
                campaign_name, 
                tracking,
                score, 
                priority, 
                status, 
                assigned_to,
                branch_id,
                assigned_branch_id,
                notes,
                test_drive_date, 
                showroom_visit_date, 
                booking_expected_date,
                next_followup_at, 
                followup_1, 
                followup_2, 
                followup_3,
                pincode,
                lead_capture_latitude,
                lead_capture_longitude,
                location_tag
            )
            VALUES
            (
                $1,$2,$3,$4,$5,$6,$7,$8,
                $9,$10,$11,$12,$13,$14,
                $15,$16,$17,$18,$19,$20,$21,
                $22,$23,'NEW',$24,$25,$26,$27,
                $28,$29,$30,$31,$32,$33,$34,$35,
                $36,$37,$38
            )
            RETURNING id, assigned_to, branch_id
        `, [
            cleanText(data.name),
            phone,
            normalizePhone(data.alternate_phone),
            cleanText(data.email),
            cleanText(data.area),
            cleanText(data.district),
            cleanText(data.profession),
            cleanText(data.family_members),
            cleanText(data.vehicle_category),
            cleanText(data.fuel_type),
            cleanText(data.car_interest, "Not Selected"),
            cleanText(data.variant_interest),
            cleanText(data.budget_range),
            cleanText(data.purchase_timeline),
            cleanText(data.exchange_vehicle),
            cleanText(data.finance_required),
            action,
            cleanText(data.lead_type, action),
            source,
            cleanText(data.campaign_name || tracking.utm_campaign),
            JSON.stringify(tracking),
            score,
            priority,
            assignedTo,
            branchId,
            branchId,
            cleanText(data.notes),
            nullableDate(data.test_drive_date),
            nullableDate(data.showroom_visit_date),
            nullableDate(data.booking_expected_date),
            nullableDate(data.next_followup_at),
            new Date(now.getTime() + 5 * 60 * 1000),
            new Date(now.getTime() + 24 * 60 * 60 * 1000),
            new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
            cleanText(data.pincode),
            data.lead_capture_latitude || null,
            data.lead_capture_longitude || null,
            cleanText(data.location_tag)
        ]);

        await logActivity({
            lead_id: result.rows[0].id,
            user_id: null,
            action: "LEAD_CREATED",
            old_value: "",
            new_value: "NEW",
            remarks: `Lead created from ${source}. Branch: ${result.rows[0].branch_id || "none"}. Auto assigned to ${result.rows[0].assigned_to || "none"}.`
        });

        sendWhatsApp(
            `whatsapp:+91${phone}`,
            `Hi ${cleanText(data.name)},\n\nThanks for your interest in ${cleanText(data.car_interest, "Mahindra")}. Our team will contact you shortly.\n\n- Shiva Automobiles`
        ).catch(err => console.error("WA Customer Error:", err.message));

        if (process.env.SALES_WHATSAPP_NUMBER) {
            sendWhatsApp(
                process.env.SALES_WHATSAPP_NUMBER,
                `New Lead 🚗\n\nName: ${cleanText(data.name)}\nPhone: ${phone}\nSource: ${source}\nType: ${action}\nCar: ${cleanText(data.car_interest, "Not Selected")}\nScore: ${score}\nPriority: ${priority}`
            ).catch(err => console.error("WA Sales Error:", err.message));
        }

        res.status(201).json({
            message: "Lead saved",
            id: result.rows[0].id,
            assigned_to: result.rows[0].assigned_to,
            branch_id: result.rows[0].branch_id,
            score,
            priority
        });

    } catch (err) {
        console.error("SAVE LEAD ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

/* =====================================================
   SAVE FOLLOW-UP
===================================================== */
router.post("/lead/:id/followup", auth, requireLeadEdit, async (req, res) => {
    try {
        const leadId = parseId(req.params.id);

        if (!leadId) {
            return res.status(400).json({ message: "Invalid lead id" });
        }

        const callStatus = cleanText(req.body.call_status, "CONNECTED")
            .toUpperCase()
            .replace(/[\s-]+/g, "_");

        const response = cleanText(req.body.customer_response);
        const remarks = cleanText(req.body.remarks || req.body.followup_notes);
        const nextDate = nullableDate(req.body.next_followup_at);

        const nextStatus = String(req.body.next_status || req.body.status || "FOLLOW-UP")
            .toUpperCase();

        const safeStatus = STATUSES.includes(nextStatus) ? nextStatus : "FOLLOW-UP";

        const values = [leadId];
        const ownerClause = leadAccessAndClause(req, values, "l");

        const leadAccess = await db.query(`
            SELECT l.id, l.status
            FROM leads l
            WHERE l.id = $1 ${ownerClause}
            LIMIT 1
        `, values);

        if (!leadAccess.rows.length) {
            return res.status(404).json({
                message: "Lead not found or not accessible to you"
            });
        }

        await db.query(`
            INSERT INTO lead_followups
            (
                lead_id, 
                user_id, 
                followup_type, 
                call_status, 
                customer_response, 
                next_followup_at, 
                remarks
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [
            leadId,
            req.user.id,
            "MANUAL",
            callStatus,
            response,
            nextDate,
            remarks
        ]);

        await db.query(`
            UPDATE leads
            SET 
                last_followup_at = NOW(),
                next_followup_at = $1,
                followup_count = COALESCE(followup_count, 0) + 1,
                followup_notes = $2,
                notes = $2,
                status = $3,
                reminder_sent = false,
                updated_at = NOW()
            WHERE id = $4
        `, [
            nextDate,
            remarks,
            safeStatus,
            leadId
        ]);

        await logActivity({
            lead_id: leadId,
            user_id: req.user.id,
            action: "FOLLOWUP_SAVED",
            old_value: leadAccess.rows[0].status,
            new_value: safeStatus,
            remarks: `Call status: ${callStatus}. Response: ${response}. Remarks: ${remarks}.`
        });

        res.json({ message: "Follow-up saved" });

    } catch (err) {
        console.error("FOLLOWUP ERROR:", err);
        res.status(500).json({ message: "Follow-up error" });
    }
});

/* =====================================================
   GET LEADS
===================================================== */
router.get("/leads", auth, requireLeadView, async (req, res) => {
    try {
        await ensureLeadScopeColumns();

        const clauses = [];
        const values = [];

        appendLeadAccessScope(req, clauses, values, "l");

        if (req.query.priority) {
            values.push(String(req.query.priority).toUpperCase());
            clauses.push(`l.priority = $${values.length}`);
        }

        if (req.query.status) {
            values.push(String(req.query.status).toUpperCase());
            clauses.push(`l.status = $${values.length}`);
        }

        if (req.query.source) {
            values.push(String(req.query.source).toUpperCase());
            clauses.push(`UPPER(l.source) = $${values.length}`);
        }

        if (req.query.branch_id) {
            const branchId = parseId(req.query.branch_id);
            if (Number.isNaN(branchId)) {
                return res.status(400).json({ message: "Invalid branch filter" });
            }

            if (branchId) {
                values.push(branchId);
                clauses.push(`l.branch_id = $${values.length}`);
            }
        }

        if (req.query.search) {
            values.push(`%${String(req.query.search).toLowerCase()}%`);
            clauses.push(`(
                LOWER(l.name) LIKE $${values.length}
                OR l.phone LIKE $${values.length}
                OR LOWER(l.car_interest) LIKE $${values.length}
                OR LOWER(COALESCE(l.campaign_name, '')) LIKE $${values.length}
                OR LOWER(COALESCE(l.district, '')) LIKE $${values.length}
                OR LOWER(COALESCE(l.area, '')) LIKE $${values.length}
            )`);
        }

        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

        const result = await db.query(`
            SELECT 
                l.*, 
                u.name AS assigned_name, 
                u.email AS assigned_email,
                b.branch_name,
                b.branch_code
            FROM leads l
            LEFT JOIN users u ON l.assigned_to = u.id
            LEFT JOIN branches b ON l.branch_id = b.id
            ${where}
            ORDER BY l.created_at DESC, l.id DESC
        `, values);

        res.json(result.rows);

    } catch (err) {
        console.error("FETCH LEADS ERROR:", err);
        res.status(500).json({ message: "Fetch error" });
    }
});


/* =====================================================
   CUSTOMER OTP VERIFICATION
===================================================== */
router.post("/lead/:id/send-otp", auth, requireLeadEdit, async (req, res) => {
    try {
        await ensureLeadVerificationColumns();

        const leadId = parseId(req.params.id);

        if (!leadId) {
            return res.status(400).json({ message: "Invalid lead id" });
        }

        const values = [leadId];
        const ownerClause = leadAccessAndClause(req, values, "l");

        const leadResult = await db.query(`
            SELECT l.id, l.name, l.phone, l.verification_status
            FROM leads l
            WHERE l.id = $1 ${ownerClause}
            LIMIT 1
        `, values);

        if (!leadResult.rows.length) {
            return res.status(404).json({
                message: "Lead not found or not accessible to you"
            });
        }

        const lead = leadResult.rows[0];
        const phone = normalizePhone(lead.phone);

        if (phone.length !== 10) {
            return res.status(400).json({ message: "Lead does not have a valid phone number" });
        }

        const otp = generateOtp();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await db.query(`
            UPDATE leads
            SET
                verification_otp = $1,
                verification_otp_expires_at = $2,
                verification_otp_sent_at = NOW(),
                verification_otp_attempts = 0,
                verification_status = CASE
                    WHEN verification_status = 'PHONE_VERIFIED' THEN verification_status
                    ELSE 'OTP_SENT'
                END,
                updated_at = NOW()
            WHERE id = $3
        `, [otp, expiresAt, leadId]);

        const message = `Hi ${cleanText(lead.name, "Customer")}, your CRM verification code is ${otp}. This code is valid for 10 minutes. - Shiva Automobiles`;
        const waResult = await sendWhatsApp(`whatsapp:+91${phone}`, message);

        await logActivity({
            lead_id: leadId,
            user_id: req.user.id,
            action: "OTP_SENT",
            old_value: lead.verification_status || "NOT_VERIFIED",
            new_value: "OTP_SENT",
            remarks: `Verification OTP sent to ${maskPhone(phone)}`
        });

        res.json({
            message: "Verification OTP sent successfully",
            phone: maskPhone(phone),
            expires_in_minutes: 10,
            debug_otp: waResult?.skipped || process.env.NODE_ENV !== "production" ? otp : undefined
        });

    } catch (err) {
        console.error("SEND OTP ERROR:", err);
        res.status(500).json({ message: "Failed to send verification OTP" });
    }
});

router.post("/lead/:id/verify-otp", auth, requireLeadEdit, async (req, res) => {
    try {
        await ensureLeadVerificationColumns();

        const leadId = parseId(req.params.id);
        const otp = cleanText(req.body.otp);
        const remarks = cleanText(req.body.remarks);

        if (!leadId) {
            return res.status(400).json({ message: "Invalid lead id" });
        }

        if (!/^\d{6}$/.test(otp)) {
            return res.status(400).json({ message: "Enter valid 6 digit OTP" });
        }

        const values = [leadId];
        const ownerClause = leadAccessAndClause(req, values, "l");

        const leadResult = await db.query(`
            SELECT
                l.id,
                l.verification_status,
                l.verification_otp,
                l.verification_otp_expires_at,
                COALESCE(l.verification_otp_attempts, 0)::int AS attempts
            FROM leads l
            WHERE l.id = $1 ${ownerClause}
            LIMIT 1
        `, values);

        if (!leadResult.rows.length) {
            return res.status(404).json({
                message: "Lead not found or not accessible to you"
            });
        }

        const lead = leadResult.rows[0];

        if (!lead.verification_otp || !lead.verification_otp_expires_at) {
            return res.status(400).json({ message: "OTP not generated or already used" });
        }

        if (lead.attempts >= 5) {
            return res.status(429).json({ message: "Too many wrong OTP attempts. Send OTP again." });
        }

        if (new Date(lead.verification_otp_expires_at).getTime() < Date.now()) {
            await db.query(`
                UPDATE leads
                SET verification_status = 'OTP_EXPIRED', updated_at = NOW()
                WHERE id = $1
            `, [leadId]);

            return res.status(400).json({ message: "OTP expired. Please send OTP again." });
        }

        if (String(lead.verification_otp) !== otp) {
            await db.query(`
                UPDATE leads
                SET
                    verification_otp_attempts = COALESCE(verification_otp_attempts, 0) + 1,
                    updated_at = NOW()
                WHERE id = $1
            `, [leadId]);

            return res.status(400).json({ message: "Invalid OTP" });
        }

        const result = await db.query(`
            UPDATE leads
            SET
                verification_status = 'PHONE_VERIFIED',
                verified_by = $1,
                verified_at = NOW(),
                verification_remarks = $2,
                verification_otp = NULL,
                verification_otp_expires_at = NULL,
                verification_otp_attempts = 0,
                updated_at = NOW()
            WHERE id = $3
            RETURNING id, verification_status, verified_at
        `, [req.user.id, remarks, leadId]);

        await logActivity({
            lead_id: leadId,
            user_id: req.user.id,
            action: "PHONE_VERIFIED",
            old_value: lead.verification_status || "NOT_VERIFIED",
            new_value: "PHONE_VERIFIED",
            remarks: remarks || "Customer phone verified using OTP"
        });

        res.json({
            message: "Customer phone verified successfully",
            lead: result.rows[0]
        });

    } catch (err) {
        console.error("VERIFY OTP ERROR:", err);
        res.status(500).json({ message: "Failed to verify OTP" });
    }
});

/* =====================================================
   FOLLOW-UP HISTORY
===================================================== */
router.get("/lead/:id/followups", auth, requireLeadView, async (req, res) => {
    try {
        const leadId = parseId(req.params.id);

        if (!leadId) {
            return res.status(400).json({ message: "Invalid lead id" });
        }

        const values = [leadId];
        const ownerClause = leadAccessAndClause(req, values, "l");

        const access = await db.query(`
            SELECT l.id
            FROM leads l
            WHERE l.id = $1 ${ownerClause}
            LIMIT 1
        `, values);

        if (!access.rows.length) {
            return res.status(404).json({
                message: "Lead not found or not accessible to you"
            });
        }

        const result = await db.query(`
            SELECT 
                f.*, 
                u.name AS user_name
            FROM lead_followups f
            LEFT JOIN users u ON f.user_id = u.id
            WHERE f.lead_id = $1
            ORDER BY f.created_at DESC
        `, [leadId]);

        res.json(result.rows);

    } catch (err) {
        console.error("FOLLOWUP HISTORY ERROR:", err);
        res.status(500).json({
            message: "Failed to load follow-ups"
        });
    }
});

/* =====================================================
   ACTIVITY LOG HISTORY
===================================================== */
router.get("/lead/:id/activity", auth, requireLeadView, async (req, res) => {
    try {
        const leadId = parseId(req.params.id);

        if (!leadId) {
            return res.status(400).json({ message: "Invalid lead id" });
        }

        const values = [leadId];
        const ownerClause = leadAccessAndClause(req, values, "l");

        const access = await db.query(`
            SELECT l.id
            FROM leads l
            WHERE l.id = $1 ${ownerClause}
            LIMIT 1
        `, values);

        if (!access.rows.length) {
            return res.status(404).json({
                message: "Lead not found or not accessible to you"
            });
        }

        const result = await db.query(`
            SELECT 
                a.id,
                a.action,
                a.old_value,
                a.new_value,
                a.remarks,
                a.created_at,
                u.name AS user_name,
                u.email AS user_email
            FROM activity_logs a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.lead_id = $1
            ORDER BY a.created_at DESC
        `, [leadId]);

        res.json(result.rows);

    } catch (err) {
        console.error("ACTIVITY HISTORY ERROR:", err);
        res.status(500).json({
            message: "Failed to load activity history"
        });
    }
});

/* =====================================================
   UPDATE STATUS
===================================================== */
router.put("/lead/:id/status", auth, requireLeadEdit, async (req, res) => {
    try {
        const leadId = parseId(req.params.id);

        if (!leadId) {
            return res.status(400).json({ message: "Invalid lead id" });
        }

        const status = String(req.body.status || "").toUpperCase();

        if (!STATUSES.includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        const accessValues = [leadId];
        const accessOwnerClause = leadAccessAndClause(req, accessValues, "l");

        const oldLead = await db.query(`
            SELECT 
                l.id, 
                l.status
            FROM leads l
            WHERE l.id = $1 ${accessOwnerClause}
            LIMIT 1
        `, accessValues);

        if (!oldLead.rows.length) {
            return res.status(404).json({
                message: "Lead not found or not accessible to you"
            });
        }

        const lostReason = status === "LOST"
            ? cleanText(req.body.lost_reason)
            : "";

        const competitorModel = status === "LOST"
            ? cleanText(req.body.competitor_model)
            : "";

        const updateValues = [
            status,
            lostReason,
            competitorModel,
            leadId
        ];

        const updateOwnerClause = leadAccessAndClause(req, updateValues, "l");

        const result = await db.query(`
            UPDATE leads l
            SET 
                status = $1,
                lost_reason = CASE 
                    WHEN $1 = 'LOST' THEN $2 
                    ELSE lost_reason 
                END,
                competitor_model = CASE 
                    WHEN $1 = 'LOST' THEN $3 
                    ELSE competitor_model 
                END,
                updated_at = NOW()
            WHERE l.id = $4 ${updateOwnerClause}
            RETURNING id, status, lost_reason, competitor_model
        `, updateValues);

        if (!result.rows.length) {
            return res.status(404).json({
                message: "Lead not found or not accessible to you"
            });
        }

        await logActivity({
            lead_id: leadId,
            user_id: req.user.id,
            action: "STATUS_UPDATED",
            old_value: oldLead.rows[0].status,
            new_value: status,
            remarks: status === "LOST"
                ? `Lost reason: ${lostReason}. Competitor: ${competitorModel}.`
                : "Lead status updated."
        });

        res.json({
            message: "Status updated",
            lead: result.rows[0]
        });

    } catch (err) {
        console.error("STATUS ERROR:", err);
        res.status(500).json({
            message: "Status update failed"
        });
    }
});

/* =====================================================
   ASSIGN LEAD
===================================================== */
router.put("/lead/:id/assign", auth, requireLeadAssign, async (req, res) => {
    try {
        const leadId = parseId(req.params.id);

        if (!leadId) {
            return res.status(400).json({ message: "Invalid lead id" });
        }

        const rawUserId = req.body.user_id ?? req.body.assigned_to ?? null;
        const userId = parseId(rawUserId);

        if (Number.isNaN(userId)) {
            return res.status(400).json({
                message: "Invalid user selected"
            });
        }

        if (userId) {
            const selectedUser = await db.query(`
                SELECT id, role, branch_id, status
                FROM users
                WHERE id = $1
                LIMIT 1
            `, [userId]);

            if (!selectedUser.rows.length) {
                return res.status(400).json({
                    message: "Selected user not found"
                });
            }

            if (normalizeRole(selectedUser.rows[0].role) !== "sales") {
                return res.status(400).json({
                    message: "Please select only sales user"
                });
            }

            if (String(selectedUser.rows[0].status || "ACTIVE").toUpperCase() !== "ACTIVE") {
                return res.status(400).json({
                    message: "Selected user is inactive"
                });
            }
        }

        const values = [leadId];
        const ownerClause = leadAccessAndClause(req, values, "l");

        const oldLead = await db.query(`
            SELECT 
                l.id, 
                l.assigned_to,
                l.branch_id
            FROM leads l
            WHERE l.id = $1 ${ownerClause}
            LIMIT 1
        `, values);

        if (!oldLead.rows.length) {
            return res.status(404).json({
                message: "Lead not found or not accessible to you"
            });
        }

        let newBranchId = oldLead.rows[0].branch_id || null;

        if (userId) {
            const userBranchId = await getUserBranchId(userId);
            if (userBranchId) newBranchId = userBranchId;
        }

        const updateValues = [userId, newBranchId, leadId];
        const updateOwnerClause = leadAccessAndClause(req, updateValues, "l");

        const result = await db.query(`
            UPDATE leads l
            SET 
                assigned_to = $1,
                branch_id = COALESCE($2, branch_id),
                assigned_branch_id = COALESCE($2, assigned_branch_id),
                updated_at = NOW()
            WHERE l.id = $3 ${updateOwnerClause}
            RETURNING id, assigned_to, branch_id
        `, updateValues);

        if (!result.rows.length) {
            return res.status(404).json({
                message: "Lead not found or not accessible to you"
            });
        }

        await logActivity({
            lead_id: leadId,
            user_id: req.user.id,
            action: userId ? "LEAD_ASSIGNED" : "LEAD_UNASSIGNED",
            old_value: oldLead.rows[0]?.assigned_to || "",
            new_value: userId || "",
            remarks: userId
                ? `Lead assigned to user ${userId}`
                : "Lead unassigned"
        });

        res.json({
            message: userId ? "Lead assigned" : "Lead unassigned",
            lead: result.rows[0]
        });

    } catch (err) {
        console.error("ASSIGN ERROR:", err);
        res.status(500).json({
            message: "Assign failed"
        });
    }
});

/* =====================================================
   UPDATE NOTES
===================================================== */
router.put("/lead/:id/notes", auth, requireLeadEdit, async (req, res) => {
    try {
        const leadId = parseId(req.params.id);

        if (!leadId) {
            return res.status(400).json({ message: "Invalid lead id" });
        }

        const values = [
            cleanText(req.body.notes),
            leadId
        ];

        const ownerClause = leadAccessAndClause(req, values, "l");

        const oldLead = await db.query(`
            SELECT l.notes
            FROM leads l
            WHERE l.id = $2 ${ownerClause}
            LIMIT 1
        `, values);

        const result = await db.query(`
            UPDATE leads l
            SET 
                notes = $1, 
                updated_at = NOW()
            WHERE l.id = $2 ${ownerClause}
            RETURNING id
        `, values);

        if (!result.rows.length) {
            return res.status(404).json({
                message: "Lead not found or not accessible to you"
            });
        }

        await logActivity({
            lead_id: leadId,
            user_id: req.user.id,
            action: "NOTES_UPDATED",
            old_value: oldLead.rows[0]?.notes || "",
            new_value: cleanText(req.body.notes),
            remarks: "Lead notes updated."
        });

        res.json({ message: "Notes saved" });

    } catch (err) {
        console.error("NOTES ERROR:", err);
        res.status(500).json({
            message: "Notes update failed"
        });
    }
});

/* =====================================================
   ANALYTICS
===================================================== */
router.get("/analytics", auth, requireLeadView, async (req, res) => {
    try {
        const values = [];
        const clauses = [];

        appendLeadAccessScope(req, clauses, values, "l");

        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

        const result = await db.query(`
            SELECT
                COUNT(*)::int AS total,

                COUNT(*) FILTER (
                    WHERE l.priority = 'HOT'
                )::int AS hot,

                COUNT(*) FILTER (
                    WHERE l.priority = 'WARM'
                )::int AS warm,

                COUNT(*) FILTER (
                    WHERE l.priority = 'COLD'
                )::int AS cold,

                COUNT(*) FILTER (
                    WHERE l.action_type IN ('ENQUIRY','QUICK_ENQUIRY','COMPLETE_ENQUIRY')
                )::int AS enquiry,

                COUNT(*) FILTER (
                    WHERE l.action_type = 'TEST_DRIVE'
                )::int AS testdrive,

                COUNT(*) FILTER (
                    WHERE l.action_type = 'CALL'
                )::int AS call,

                COUNT(*) FILTER (
                    WHERE l.action_type = 'WHATSAPP'
                )::int AS whatsapp,

                COUNT(*) FILTER (
                    WHERE l.status = 'CLOSED'
                )::int AS closed,

                COUNT(*) FILTER (
                    WHERE l.status = 'BOOKED'
                )::int AS booked,

                COUNT(*) FILTER (
                    WHERE l.status = 'LOST'
                )::int AS lost,

                COUNT(*) FILTER (
                    WHERE l.assigned_to IS NULL
                )::int AS unassigned,

                COUNT(*) FILTER (
                    WHERE l.next_followup_at::date = CURRENT_DATE
                    AND l.status NOT IN ('CLOSED','LOST')
                )::int AS today_followups,

                COUNT(*) FILTER (
                    WHERE l.next_followup_at < NOW()
                    AND l.status NOT IN ('CLOSED','LOST')
                )::int AS overdue_followups,

                COUNT(*) FILTER (
                    WHERE l.next_followup_at < NOW()
                    AND l.status NOT IN ('CLOSED','LOST')
                )::int AS missed_followups,

                COUNT(*) FILTER (
                    WHERE l.status = 'BOOKED'
                    AND l.created_at >= date_trunc('month', NOW())
                )::int AS booked_month

            FROM leads l
            ${where}
        `, values);

        const bySource = await db.query(`
            SELECT 
                COALESCE(l.source, 'WEBSITE') AS source, 
                COUNT(*)::int AS count
            FROM leads l
            ${where}
            GROUP BY COALESCE(l.source, 'WEBSITE')
            ORDER BY count DESC
        `, values);

        res.json({
            ...result.rows[0],
            by_source: bySource.rows
        });

    } catch (err) {
        console.error("ANALYTICS ERROR:", err);
        res.status(500).json({
            message: "Analytics failed"
        });
    }
});

/* =====================================================
   UPDATE FULL LEAD DETAILS
===================================================== */
router.put("/lead/:id", auth, requireLeadEdit, async (req, res) => {
    try {
        const leadId = parseId(req.params.id);

        if (!leadId) {
            return res.status(400).json({
                message: "Invalid lead id"
            });
        }

        const data = req.body || {};

        const values = [
            cleanText(data.name),
            normalizePhone(data.phone),
            normalizePhone(data.alternate_phone),
            cleanText(data.email),
            cleanText(data.area),
            cleanText(data.district),
            cleanText(data.profession),
            cleanText(data.family_members),
            cleanText(data.vehicle_category),
            cleanText(data.fuel_type),
            cleanText(data.car_interest),
            cleanText(data.variant_interest),
            cleanText(data.preferred_color),
            cleanText(data.budget_range),
            cleanText(data.purchase_timeline),
            cleanText(data.exchange_vehicle),
            cleanText(data.finance_required),
            cleanText(data.notes),
            nullableDate(data.test_drive_date),
            nullableDate(data.showroom_visit_date),
            nullableDate(data.booking_expected_date),
            cleanText(data.pincode),
            leadId
        ];

        const ownerClause = leadAccessAndClause(req, values, "l");

        const oldLead = await db.query(`
            SELECT 
                l.id,
                l.name,
                l.phone,
                l.car_interest,
                l.variant_interest,
                l.status
            FROM leads l
            WHERE l.id = $23 ${ownerClause}
            LIMIT 1
        `, values);

        const result = await db.query(`
            UPDATE leads l
            SET
                name = $1,
                phone = $2,
                alternate_phone = $3,
                email = $4,
                area = $5,
                district = $6,
                profession = $7,
                family_members = $8,
                vehicle_category = $9,
                fuel_type = $10,
                car_interest = $11,
                variant_interest = $12,
                preferred_color = $13,
                budget_range = $14,
                purchase_timeline = $15,
                exchange_vehicle = $16,
                finance_required = $17,
                notes = $18,
                test_drive_date = $19,
                showroom_visit_date = $20,
                booking_expected_date = $21,
                pincode = $22,
                lead_type = 'COMPLETE_ENQUIRY',
                action_type = 'COMPLETE_ENQUIRY',
                updated_at = NOW()
            WHERE l.id = $23 ${ownerClause}
            RETURNING *
        `, values);

        if (!result.rows.length) {
            return res.status(404).json({
                message: "Lead not found or not accessible to you"
            });
        }

        await logActivity({
            lead_id: leadId,
            user_id: req.user.id,
            action: "LEAD_DETAILS_UPDATED",
            old_value: oldLead.rows.length
                ? `${oldLead.rows[0].name} | ${oldLead.rows[0].phone} | ${oldLead.rows[0].car_interest}`
                : "",
            new_value: `${result.rows[0].name} | ${result.rows[0].phone} | ${result.rows[0].car_interest}`,
            remarks: "Full enquiry details updated."
        });

        res.json({
            message: "Lead updated successfully",
            lead: result.rows[0]
        });

    } catch (err) {
        console.error("LEAD UPDATE ERROR:", err);
        res.status(500).json({
            message: "Lead update failed"
        });
    }
});

/* =====================================================
   AUTO ESCALATE OVERDUE FOLLOW-UPS
===================================================== */
router.post("/followups/escalate", auth, requireLeadMonitor, async (req, res) => {
    try {
        const values = [];
        const clauses = [
            "l.next_followup_at IS NOT NULL",
            "l.status NOT IN ('CLOSED', 'LOST')",
            "l.next_followup_at < NOW()"
        ];

        appendLeadAccessScope(req, clauses, values, "l");

        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

        const result = await db.query(`
            UPDATE leads l
            SET 
                priority = CASE
                    WHEN l.next_followup_at < NOW() - INTERVAL '48 hours' THEN 'HOT'
                    WHEN l.next_followup_at < NOW() - INTERVAL '24 hours' THEN 'WARM'
                    ELSE l.priority
                END,
                updated_at = NOW()
            ${where}
            RETURNING id, name, priority, next_followup_at
        `, values);

        for (const lead of result.rows) {
            await logActivity({
                lead_id: lead.id,
                user_id: req.user.id,
                action: "AUTO_ESCALATED",
                old_value: "",
                new_value: lead.priority,
                remarks: `Overdue follow-up escalated. Next follow-up was ${lead.next_followup_at}.`
            });
        }

        res.json({
            message: "Overdue follow-ups escalated",
            updated: result.rows.length,
            leads: result.rows
        });

    } catch (err) {
        console.error("ESCALATION ERROR:", err);
        res.status(500).json({
            message: "Escalation failed"
        });
    }
});

/* =====================================================
   SALES PERFORMANCE
===================================================== */
router.get("/sales-performance", auth, requireLeadMonitor, async (req, res) => {
    try {
        const values = [];
        const leadJoinClauses = [];

        appendLeadAccessScope(req, leadJoinClauses, values, "l");

        const leadJoinAccess = leadJoinClauses.length
            ? `AND ${leadJoinClauses.join(" AND ")}`
            : "";

        const result = await db.query(`
            SELECT
                u.id,
                u.name,
                u.email,
                u.branch_id,
                b.branch_name,

                COUNT(l.id)::int AS total_leads,

                COUNT(*) FILTER (
                    WHERE l.next_followup_at::date = CURRENT_DATE
                    AND l.status NOT IN ('CLOSED','LOST')
                )::int AS today_followups,

                COUNT(*) FILTER (
                    WHERE l.next_followup_at < NOW()
                    AND l.status NOT IN ('CLOSED','LOST')
                )::int AS overdue_followups,

                COUNT(*) FILTER (
                    WHERE l.status = 'TEST-DRIVE'
                )::int AS test_drives,

                COUNT(*) FILTER (
                    WHERE l.status = 'BOOKED'
                )::int AS booked,

                COUNT(*) FILTER (
                    WHERE l.status = 'CLOSED'
                )::int AS closed,

                COUNT(*) FILTER (
                    WHERE l.status = 'LOST'
                )::int AS lost

            FROM users u
            LEFT JOIN branches b ON u.branch_id = b.id
            LEFT JOIN leads l 
                ON l.assigned_to = u.id
                ${leadJoinAccess}
            WHERE LOWER(u.role) = 'sales'
            GROUP BY u.id, b.branch_name
            ORDER BY closed DESC, booked DESC, total_leads DESC
        `, values);

        res.json(result.rows);

    } catch (err) {
        console.error("SALES PERFORMANCE ERROR:", err);
        res.status(500).json({
            message: "Performance fetch failed"
        });
    }
});

module.exports = router;