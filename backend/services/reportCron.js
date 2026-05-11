const cron = require("node-cron");
const db = require("../config/db");
const { sendEmailReport } = require("./emailService");

function istDate(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);
}

function addDays(dateStr, days) {
    const date = new Date(`${dateStr}T00:00:00+05:30`);
    date.setDate(date.getDate() + days);

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);
}

function previousMonthRange() {
    const today = istDate();
    const current = new Date(`${today}T00:00:00+05:30`);

    const year = current.getFullYear();
    const month = current.getMonth();

    const firstDayPreviousMonth = new Date(year, month - 1, 1);
    const lastDayPreviousMonth = new Date(year, month, 0);

    const from = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(firstDayPreviousMonth);

    const to = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(lastDayPreviousMonth);

    return { from, to };
}

async function buildReportSummary(type, fromDate, toDate) {
    const from = `${fromDate}T00:00:00+05:30`;
    const to = `${toDate}T23:59:59+05:30`;

    const overview = await db.query(`
        SELECT
            COUNT(*)::int AS total_leads,
            COUNT(*) FILTER (WHERE priority = 'HOT')::int AS hot,
            COUNT(*) FILTER (WHERE priority = 'WARM')::int AS warm,
            COUNT(*) FILTER (WHERE priority = 'COLD')::int AS cold,
            COUNT(*) FILTER (WHERE status = 'TEST-DRIVE')::int AS test_drives,
            COUNT(*) FILTER (WHERE status = 'BOOKED')::int AS booked,
            COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS closed,
            COUNT(*) FILTER (WHERE status = 'LOST')::int AS lost,
            COUNT(*) FILTER (WHERE assigned_to IS NULL)::int AS unassigned,
            COUNT(*) FILTER (WHERE vehicle_category = 'AD')::int AS ad_leads,
            COUNT(*) FILTER (WHERE vehicle_category = 'EV')::int AS ev_leads
        FROM leads
        WHERE created_at BETWEEN $1 AND $2
    `, [from, to]);

    const sourceSummary = await db.query(`
        SELECT COALESCE(source, 'UNKNOWN') AS source, COUNT(*)::int AS count
        FROM leads
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY COALESCE(source, 'UNKNOWN')
        ORDER BY count DESC
        LIMIT 8
    `, [from, to]);

    const modelSummary = await db.query(`
        SELECT COALESCE(car_interest, 'Not Selected') AS model, COUNT(*)::int AS count
        FROM leads
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY COALESCE(car_interest, 'Not Selected')
        ORDER BY count DESC
        LIMIT 8
    `, [from, to]);

    const userPerformance = await db.query(`
        SELECT
            u.name,
            COUNT(l.id)::int AS assigned_leads,
            COUNT(l.id) FILTER (WHERE l.status = 'BOOKED')::int AS booked,
            COUNT(l.id) FILTER (WHERE l.status = 'CLOSED')::int AS closed,
            COUNT(l.id) FILTER (
                WHERE l.next_followup_at < NOW()
                AND l.status NOT IN ('CLOSED','LOST')
            )::int AS missed_followups
        FROM users u
        LEFT JOIN leads l
            ON l.assigned_to = u.id
            AND l.created_at BETWEEN $1 AND $2
        WHERE LOWER(u.role) = 'sales'
        GROUP BY u.id, u.name
        ORDER BY closed DESC, booked DESC, assigned_leads DESC
        LIMIT 10
    `, [from, to]);

    const followups = await db.query(`
        SELECT
            COUNT(*) FILTER (
                WHERE next_followup_at BETWEEN $1 AND $2
            )::int AS scheduled_followups,
            COUNT(*) FILTER (
                WHERE next_followup_at < NOW()
                AND status NOT IN ('CLOSED','LOST')
            )::int AS missed_or_due_followups
        FROM leads
        WHERE next_followup_at IS NOT NULL
    `, [from, to]);

    const o = overview.rows[0];

    const sourceText = sourceSummary.rows
        .map(s => `${s.source}: ${s.count}`)
        .join("\n") || "-";

    const modelText = modelSummary.rows
        .map(m => `${m.model}: ${m.count}`)
        .join("\n") || "-";

    const userText = userPerformance.rows
        .map(u => `${u.name}: ${u.assigned_leads} leads / ${u.booked} bookings / ${u.closed} closed / ${u.missed_followups} missed`)
        .join("\n") || "-";

    const summary = `📊 ${type.toUpperCase()} CRM REPORT
Period: ${fromDate} to ${toDate}

Lead Summary:
Total Leads: ${o.total_leads}
Hot: ${o.hot}
Warm: ${o.warm}
Cold: ${o.cold}
Unassigned: ${o.unassigned}

Status:
Test Drives: ${o.test_drives}
Booked: ${o.booked}
Closed: ${o.closed}
Lost: ${o.lost}

Vehicle Category:
AD Leads: ${o.ad_leads}
EV Leads: ${o.ev_leads}

Lead Sources:
${sourceText}

Model Demand:
${modelText}

Sales Performance:
${userText}

Follow-ups:
Scheduled: ${followups.rows[0].scheduled_followups}
Missed / Due: ${followups.rows[0].missed_or_due_followups}

Remarks:
Please review missed follow-ups, hot leads and pending bookings immediately.`;

    return {
        type,
        fromDate,
        toDate,
        summary
    };
}

async function sendScheduledReport(type, fromDate, toDate) {
    const to = process.env.REPORT_RECEIVER_EMAIL;

    if (!to) {
        console.log("REPORT_RECEIVER_EMAIL missing. Skipping scheduled report.");
        return;
    }

    const report = await buildReportSummary(type, fromDate, toDate);

    const subject = `CRM ${type.toUpperCase()} Report - ${fromDate} to ${toDate}`;

    const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
            <h2>📊 CRM ${type.toUpperCase()} Report</h2>
            <p><strong>Period:</strong> ${fromDate} to ${toDate}</p>

            <pre style="
                background:#f8fafc;
                padding:16px;
                border-radius:12px;
                border:1px solid #e5e7eb;
                white-space:pre-wrap;
                font-family:Arial,sans-serif;
                color:#111827;
            ">${report.summary}</pre>

            <p style="font-size:13px;color:#64748b;">
                This report was automatically generated from Dealer CRM.
            </p>
        </div>
    `;

    await sendEmailReport({
        to,
        subject,
        html,
        text: report.summary
    });

    try {
        await db.query(`
            INSERT INTO report_logs
            (report_type, report_date, date_from, date_to, sent_to_email, status, summary)
            VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)
        `, [
            type,
            fromDate,
            toDate,
            to,
            "EMAIL_SENT",
            JSON.stringify(report)
        ]);
    } catch (err) {
        console.error("REPORT LOG ERROR:", err.message);
    }

    console.log(`✅ ${type} report sent to ${to}`);
}

// Daily report: every day 9 PM IST
cron.schedule(process.env.REPORT_DAILY_CRON || "0 21 * * *", async () => {
    try {
        const today = istDate();
        await sendScheduledReport("daily", today, today);
    } catch (err) {
        console.error("DAILY REPORT CRON ERROR:", err.message);
    }
}, {
    timezone: "Asia/Kolkata"
});

// Weekly report: every Sunday 8 PM IST
cron.schedule(process.env.REPORT_WEEKLY_CRON || "0 20 * * 0", async () => {
    try {
        const today = istDate();
        const from = addDays(today, -6);
        await sendScheduledReport("weekly", from, today);
    } catch (err) {
        console.error("WEEKLY REPORT CRON ERROR:", err.message);
    }
}, {
    timezone: "Asia/Kolkata"
});

// Monthly report: 1st day of month 9 AM IST, sends previous month report
cron.schedule(process.env.REPORT_MONTHLY_CRON || "0 9 1 * *", async () => {
    try {
        const range = previousMonthRange();
        await sendScheduledReport("monthly", range.from, range.to);
    } catch (err) {
        console.error("MONTHLY REPORT CRON ERROR:", err.message);
    }
}, {
    timezone: "Asia/Kolkata"
});

console.log("📑 Report cron started...");