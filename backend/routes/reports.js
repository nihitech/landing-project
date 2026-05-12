const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");
const { sendEmailReport } = require("../services/emailService");

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
}

function requireAdmin(req, res, next) {
    if (normalizeRole(req.user?.role) !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
    }
    next();
}

function getDateRange(type, query) {
    const now = new Date();

    if (type === "daily") {
        const date = query.date || now.toISOString().slice(0, 10);
        return {
            from: `${date} 00:00:00`,
            to: `${date} 23:59:59`,
            label: date
        };
    }

    if (type === "weekly") {
        const from = query.from;
        const to = query.to;

        if (!from || !to) {
            throw new Error("Weekly report requires from and to dates");
        }

        return {
            from: `${from} 00:00:00`,
            to: `${to} 23:59:59`,
            label: `${from} to ${to}`
        };
    }

    if (type === "monthly") {
        const month = query.month;

        if (!month) {
            throw new Error("Monthly report requires month format YYYY-MM");
        }

        const from = `${month}-01`;
        const date = new Date(from);
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        const to = `${month}-${String(lastDay).padStart(2, "0")}`;

        return {
            from: `${from} 00:00:00`,
            to: `${to} 23:59:59`,
            label: month
        };
    }

    if (type === "custom") {
        const from = query.from;
        const to = query.to;

        if (!from || !to) {
            throw new Error("Custom report requires from and to dates");
        }

        return {
            from: `${from} 00:00:00`,
            to: `${to} 23:59:59`,
            label: `${from} to ${to}`
        };
    }

    throw new Error("Invalid report type");
}

async function generateReport(type, range) {
    const params = [range.from, range.to];

    const overview = await db.query(`
        SELECT
            COUNT(*)::int AS total_leads,

            COUNT(*) FILTER (
                WHERE action_type IN ('ENQUIRY','QUICK_ENQUIRY','COMPLETE_ENQUIRY')
            )::int AS enquiries,

            COUNT(*) FILTER (
                WHERE lead_type = 'COMPLETE_ENQUIRY'
                OR action_type = 'COMPLETE_ENQUIRY'
            )::int AS complete_enquiries,

            COUNT(*) FILTER (WHERE source = 'WEBSITE')::int AS website_leads,
            COUNT(*) FILTER (WHERE source = 'FACEBOOK')::int AS facebook_leads,
            COUNT(*) FILTER (WHERE source = 'INSTAGRAM')::int AS instagram_leads,
            COUNT(*) FILTER (WHERE source = 'WHATSAPP')::int AS whatsapp_leads,
            COUNT(*) FILTER (WHERE source = 'CALL_NOW')::int AS call_now_leads,

            COUNT(*) FILTER (WHERE priority = 'HOT')::int AS hot,
            COUNT(*) FILTER (WHERE priority = 'WARM')::int AS warm,
            COUNT(*) FILTER (WHERE priority = 'COLD')::int AS cold,

            COUNT(*) FILTER (WHERE assigned_to IS NULL)::int AS unassigned,

            COUNT(*) FILTER (WHERE status = 'TEST-DRIVE')::int AS test_drives,
            COUNT(*) FILTER (WHERE status = 'BOOKED')::int AS booked,
            COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS closed,
            COUNT(*) FILTER (WHERE status = 'LOST')::int AS lost,

            COUNT(*) FILTER (WHERE vehicle_category = 'AD')::int AS ad_leads,
            COUNT(*) FILTER (WHERE vehicle_category = 'EV')::int AS ev_leads

        FROM leads
        WHERE created_at BETWEEN $1 AND $2
    `, params);

    const sourceSummary = await db.query(`
        SELECT
            COALESCE(source, 'UNKNOWN') AS source,
            COUNT(*)::int AS count
        FROM leads
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY COALESCE(source, 'UNKNOWN')
        ORDER BY count DESC
    `, params);

    const modelSummary = await db.query(`
        SELECT
            COALESCE(car_interest, 'Not Selected') AS model,
            COUNT(*)::int AS count
        FROM leads
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY COALESCE(car_interest, 'Not Selected')
        ORDER BY count DESC
        LIMIT 15
    `, params);

    const userPerformance = await db.query(`
        SELECT
            u.id,
            u.name,
            u.email,

            COUNT(l.id)::int AS assigned_leads,

            COUNT(l.id) FILTER (
                WHERE l.priority = 'HOT'
            )::int AS hot_leads,

            COUNT(l.id) FILTER (
                WHERE l.status = 'TEST-DRIVE'
            )::int AS test_drives,

            COUNT(l.id) FILTER (
                WHERE l.status = 'BOOKED'
            )::int AS booked,

            COUNT(l.id) FILTER (
                WHERE l.status = 'CLOSED'
            )::int AS closed,

            COUNT(l.id) FILTER (
                WHERE l.next_followup_at < NOW()
                AND l.status NOT IN ('CLOSED','LOST')
            )::int AS missed_followups

        FROM users u
        LEFT JOIN leads l
            ON l.assigned_to = u.id
            AND l.created_at BETWEEN $1 AND $2
        WHERE LOWER(u.role) = 'sales'
        GROUP BY u.id, u.name, u.email
        ORDER BY closed DESC, booked DESC, assigned_leads DESC
    `, params);

    const followups = await db.query(`
        SELECT
            COUNT(*)::int AS total_followups,

            COUNT(*) FILTER (
                WHERE next_followup_at BETWEEN $1 AND $2
            )::int AS scheduled_followups,

            COUNT(*) FILTER (
                WHERE next_followup_at < NOW()
            )::int AS missed_or_due_followups

        FROM leads
        WHERE next_followup_at IS NOT NULL
    `, params);

    const recentLeads = await db.query(`
        SELECT
            l.id,
            l.name,
            l.phone,
            l.car_interest,
            l.source,
            l.priority,
            l.status,
            u.name AS assigned_name,
            l.created_at
        FROM leads l
        LEFT JOIN users u ON l.assigned_to = u.id
        WHERE l.created_at BETWEEN $1 AND $2
        ORDER BY l.created_at DESC
        LIMIT 50
    `, params);

    const report = {
        type,
        label: range.label,
        from: range.from,
        to: range.to,
        overview: overview.rows[0],
        source_summary: sourceSummary.rows,
        model_summary: modelSummary.rows,
        user_performance: userPerformance.rows,
        followups: followups.rows[0],
        recent_leads: recentLeads.rows
    };

    return report;
}

function buildWhatsappSummary(report) {
    const o = report.overview;

    const topUsers = report.user_performance
        .slice(0, 5)
        .map(u =>
            `${u.name}: ${u.assigned_leads} leads / ${u.booked} bookings / ${u.closed} closed / ${u.missed_followups} missed`
        )
        .join("\n");

    const topSources = report.source_summary
        .slice(0, 5)
        .map(s => `${s.source}: ${s.count}`)
        .join("\n");

    const topModels = report.model_summary
        .slice(0, 5)
        .map(m => `${m.model}: ${m.count}`)
        .join("\n");

    return `📊 CRM ${report.type.toUpperCase()} REPORT
Period: ${report.label}

Leads Summary:
Total Leads: ${o.total_leads}
Complete Enquiries: ${o.complete_enquiries}
Hot: ${o.hot}
Warm: ${o.warm}
Cold: ${o.cold}

Status:
Test Drives: ${o.test_drives}
Booked: ${o.booked}
Closed: ${o.closed}
Lost: ${o.lost}

Category:
AD Leads: ${o.ad_leads}
EV Leads: ${o.ev_leads}

Sources:
${topSources || "-"}

Top Models:
${topModels || "-"}

Sales Performance:
${topUsers || "-"}

Follow-ups:
Scheduled: ${report.followups.scheduled_followups}
Missed/Due: ${report.followups.missed_or_due_followups}

Remarks:
Please review missed follow-ups and pending hot leads immediately.`;
}

router.get("/email-settings/list", auth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT *
            FROM report_email_settings
            ORDER BY 
                CASE report_type
                    WHEN 'daily' THEN 1
                    WHEN 'weekly' THEN 2
                    WHEN 'monthly' THEN 3
                    WHEN 'all' THEN 4
                    ELSE 5
                END,
                id DESC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("REPORT EMAIL SETTINGS FETCH ERROR:", err);
        res.status(500).json({ message: "Failed to load email settings" });
    }
});

router.post("/email-settings", auth, requireAdmin, async (req, res) => {
    try {
        const reportType = String(req.body.report_type || "all").toLowerCase();
        const receiverEmail = String(req.body.receiver_email || "").trim();
        const ccEmail = String(req.body.cc_email || "").trim();
        const isActive = req.body.is_active !== false;

        if (!["daily", "weekly", "monthly", "all"].includes(reportType)) {
            return res.status(400).json({ message: "Invalid report type" });
        }

        if (!receiverEmail) {
            return res.status(400).json({ message: "Receiver email is required" });
        }

        const result = await db.query(`
            INSERT INTO report_email_settings
            (report_type, receiver_email, cc_email, is_active, created_by)
            VALUES ($1,$2,$3,$4,$5)
            RETURNING *
        `, [
            reportType,
            receiverEmail,
            ccEmail || null,
            isActive,
            req.user.id
        ]);

        res.status(201).json({
            message: "Report email setting saved",
            setting: result.rows[0]
        });
    } catch (err) {
        console.error("REPORT EMAIL SETTINGS SAVE ERROR:", err);
        res.status(500).json({ message: "Failed to save email setting" });
    }
});

router.put("/email-settings/:id", auth, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const reportType = String(req.body.report_type || "all").toLowerCase();
        const receiverEmail = String(req.body.receiver_email || "").trim();
        const ccEmail = String(req.body.cc_email || "").trim();
        const isActive = req.body.is_active !== false;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ message: "Invalid setting id" });
        }

        if (!["daily", "weekly", "monthly", "all"].includes(reportType)) {
            return res.status(400).json({ message: "Invalid report type" });
        }

        if (!receiverEmail) {
            return res.status(400).json({ message: "Receiver email is required" });
        }

        const result = await db.query(`
            UPDATE report_email_settings
            SET
                report_type = $1,
                receiver_email = $2,
                cc_email = $3,
                is_active = $4,
                updated_at = NOW()
            WHERE id = $5
            RETURNING *
        `, [
            reportType,
            receiverEmail,
            ccEmail || null,
            isActive,
            id
        ]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Setting not found" });
        }

        res.json({
            message: "Report email setting updated",
            setting: result.rows[0]
        });
    } catch (err) {
        console.error("REPORT EMAIL SETTINGS UPDATE ERROR:", err);
        res.status(500).json({ message: "Failed to update email setting" });
    }
});

router.delete("/email-settings/:id", auth, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ message: "Invalid setting id" });
        }

        const result = await db.query(`
            DELETE FROM report_email_settings
            WHERE id = $1
            RETURNING id
        `, [id]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Setting not found" });
        }

        res.json({ message: "Report email setting deleted" });

    } catch (err) {
        console.error("REPORT EMAIL SETTINGS DELETE ERROR:", err);
        res.status(500).json({ message: "Failed to delete email setting" });
    }
});

router.get("/:type", auth, requireAdmin, async (req, res) => {
    try {
        const { type } = req.params;

        const allowed = ["daily", "weekly", "monthly", "custom"];

        if (!allowed.includes(type)) {
            return res.status(400).json({ message: "Invalid report type" });
        }

        const range = getDateRange(type, req.query);
        const report = await generateReport(type, range);
        const whatsapp_summary = buildWhatsappSummary(report);

        // Save report history, but never block report generation if the log table is missing.
        try {
            await db.query(`
                INSERT INTO report_logs
                (report_type, report_date, date_from, date_to, status, summary)
                VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
            `, [
                type,
                range.from,
                range.to,
                "GENERATED",
                JSON.stringify(report)
            ]);
        } catch (logErr) {
            console.error("REPORT LOG ERROR:", logErr.message);
        }

        res.json({
            ...report,
            whatsapp_summary
        });

    } catch (err) {
        console.error("REPORT ERROR:", err);
        res.status(500).json({
            message: err.message || "Report generation failed"
        });
    }
});
router.post("/send-email", auth, requireAdmin, async (req, res) => {
    try {
        const {
            report_type,
            report_label,
            receiver_email,
            whatsapp_summary
        } = req.body;

        const to = receiver_email || process.env.REPORT_RECEIVER_EMAIL;

        if (!to) {
            return res.status(400).json({
                message: "Receiver email is required"
            });
        }

        if (!whatsapp_summary) {
            return res.status(400).json({
                message: "Report summary is required"
            });
        }

        const subject = `CRM ${String(report_type || "Report").toUpperCase()} Report - ${report_label || ""}`;

        const html = `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
                <h2>📊 CRM Management Report</h2>
                <p><strong>Report Type:</strong> ${report_type || "-"}</p>
                <p><strong>Period:</strong> ${report_label || "-"}</p>

                <pre style="
                    background:#f8fafc;
                    padding:16px;
                    border-radius:12px;
                    border:1px solid #e5e7eb;
                    white-space:pre-wrap;
                    font-family:Arial,sans-serif;
                ">${whatsapp_summary}</pre>

                <p style="color:#64748b;font-size:13px;">
                    This report was generated automatically from CRM.
                </p>
            </div>
        `;

        await sendEmailReport({
            to,
            subject,
            html,
            text: whatsapp_summary
        });

        res.json({
            message: "Report email sent successfully"
        });

    } catch (err) {
        console.error("SEND REPORT EMAIL ERROR:", err);
        res.status(500).json({
            message: err.message || "Email send failed"
        });
    }
});
module.exports = router;