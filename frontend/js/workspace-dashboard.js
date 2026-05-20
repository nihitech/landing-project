if (!token) {
    window.location.href = "login.html";
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value ?? "0";
}

async function safeRequest(url, fallback) {
    try {
        return await request(url, { headers: authHeaders() });
    } catch (err) {
        console.warn("Workspace request failed:", url, err.message);
        return fallback;
    }
}

async function loadWorkspace(roleKey) {
    const [summary, leads, qrSubs, fieldActs, quickEnquiries] = await Promise.all([
        safeRequest(`${API}/dashboard/summary`, {}),
        safeRequest(`${API}/leads`, []),
        safeRequest(`${API}/showroom-qr/submissions`, []),
        safeRequest(`${API}/field-activities`, []),
        safeRequest(`${API}/quick-enquiries`, [])
    ]);

    const leadRows = Array.isArray(leads) ? leads : (leads.leads || leads.data || []);
    const quickRows = Array.isArray(quickEnquiries) ? quickEnquiries : [];
    const today = new Date().toISOString().slice(0, 10);

    const myId = user?.id;

    const myLeads = leadRows.filter(l => !myId || Number(l.assigned_to) === Number(myId));
    const todayFollowups = myLeads.filter(l => String(l.next_followup_at || l.next_followup_date || "").slice(0, 10) === today);
    const overdue = myLeads.filter(l => {
        const d = l.next_followup_at || l.next_followup_date;
        if (!d) return false;
        return new Date(d) < new Date() && !["CLOSED", "LOST"].includes(String(l.status || "").toUpperCase());
    });

    const pendingQr = (qrSubs || []).filter(q => !q.lead_id && ["SUBMITTED", "REVIEWED"].includes(String(q.submission_status || "").toUpperCase()));
    const assignedActivities = (fieldActs || []).filter(a => ["ACTIVE", "PLANNED"].includes(String(a.status || "").toUpperCase()));

    const myQuick = quickRows.filter(q => !myId || Number(q.created_by) === Number(myId) || Number(q.assigned_to) === Number(myId));
    const pendingQuick = quickRows.filter(q => ["PENDING_VALIDATION", "OTP_SENT"].includes(String(q.quick_status || "").toUpperCase()));
    const verifiedQuick = quickRows.filter(q => String(q.quick_status || "").toUpperCase() === "OTP_VERIFIED");

    setText("kpiLeads", myLeads.length || summary.total || 0);
    setText("kpiToday", summary.today || 0);
    setText("kpiFollowups", todayFollowups.length || summary.today_followups || 0);
    setText("kpiOverdue", overdue.length || summary.overdue_followups || 0);
    setText("kpiQr", pendingQr.length);
    setText("kpiActivities", assignedActivities.length);
    setText("kpiQuick", roleKey === "sales" || roleKey === "field" ? myQuick.length : pendingQuick.length);
    setText("kpiQuickVerified", verifiedQuick.length);

    renderWorkspaceQueue("primaryQueue", buildQueue(roleKey, {
        myLeads,
        todayFollowups,
        overdue,
        pendingQr,
        assignedActivities,
        quickRows,
        myQuick,
        pendingQuick,
        verifiedQuick,
        summary
    }));

    renderWorkspaceQueue("quickQueue", buildQuickQueue(roleKey, {
        myQuick,
        pendingQuick,
        verifiedQuick,
        quickRows
    }));
}

function buildQueue(roleKey, ctx) {
    if (roleKey === "receptionist") {
        return [
            ...ctx.pendingQr.slice(0, 8).map(q => ({ title: q.customer_name, meta: `QR submission • ${q.phone}`, action: "Review / Convert", url: "showroom-qr-admin.html" })),
            { title: "Create / Display Today QR", meta: "Showroom walk-in flow", action: "Open", url: "showroom-qr-admin.html" }
        ];
    }

    if (roleKey === "telecaller") {
        return [
            ...ctx.pendingQuick.slice(0, 6).map(q => ({ title: q.customer_name, meta: `Quick validation • ${q.phone} • ${q.source_type}`, action: "Validate", url: "quick-enquiries.html" })),
            ...ctx.pendingQr.slice(0, 5).map(q => ({ title: q.customer_name, meta: `QR validation • ${q.phone}`, action: "Review", url: "showroom-qr-admin.html" }))
        ];
    }

    if (roleKey === "manager") {
        return [
            { title: "Quick Enquiry Pending Validation", meta: `${ctx.pendingQuick.length} waiting`, action: "Review", url: "quick-enquiries.html" },
            { title: "Verified Quick Enquiries", meta: `${ctx.verifiedQuick.length} ready to convert`, action: "Convert", url: "quick-enquiries.html" },
            { title: "Missed Follow-ups", meta: `${ctx.summary.overdue_followups || ctx.overdue.length || 0} overdue`, action: "Review", url: "leads.html" },
            { title: "Field Activities", meta: `${ctx.assignedActivities.length} active/planned`, action: "Monitor", url: "field-activities.html" }
        ];
    }

    if (roleKey === "field") {
        return [
            ...ctx.assignedActivities.slice(0, 6).map(a => ({ title: a.activity_name, meta: `${a.location_name || "-"} • ${a.status}`, action: "Check-in", url: "field-activities.html" })),
            { title: "Create Field Quick Enquiry", meta: "Capture enquiry from field activity", action: "Create", url: "quick-enquiries.html" }
        ];
    }

    if (roleKey === "sales") {
        return [
            { title: "Create Quick Enquiry", meta: "Field, referral, stall, event or known customer", action: "Create", url: "quick-enquiries.html" },
            ...ctx.myQuick.filter(q => ["PENDING_VALIDATION", "OTP_SENT", "OTP_VERIFIED"].includes(String(q.quick_status || "").toUpperCase())).slice(0, 5)
                .map(q => ({ title: q.customer_name, meta: `${q.quick_status} • ${q.phone} • ${q.source_type}`, action: "Open", url: "quick-enquiries.html" })),
            ...ctx.todayFollowups.slice(0, 4).map(l => ({ title: l.name || l.customer_name, meta: `Follow-up today • ${l.phone}`, action: "Open", url: "leads.html" })),
            ...ctx.overdue.slice(0, 3).map(l => ({ title: l.name || l.customer_name, meta: `Overdue • ${l.phone}`, action: "Open", url: "leads.html" }))
        ];
    }

    return [
        { title: "Operational Control Center", meta: "Enterprise dashboard", action: "Open", url: "dashboard.html" },
        { title: "Quick Enquiry Monitoring", meta: `${ctx.pendingQuick.length} pending validation`, action: "Open", url: "quick-enquiries.html" }
    ];
}

function buildQuickQueue(roleKey, ctx) {
    if (roleKey === "sales" || roleKey === "field") {
        return ctx.myQuick.slice(0, 8).map(q => ({
            title: q.customer_name,
            meta: `${q.quick_status} • ${q.phone} • ${q.source_type}`,
            action: "Open",
            url: "quick-enquiries.html"
        }));
    }

    if (roleKey === "telecaller" || roleKey === "manager") {
        return [
            ...ctx.pendingQuick.slice(0, 8).map(q => ({
                title: q.customer_name,
                meta: `Pending validation • ${q.phone} • ${q.source_type}`,
                action: "Validate",
                url: "quick-enquiries.html"
            })),
            ...ctx.verifiedQuick.slice(0, 5).map(q => ({
                title: q.customer_name,
                meta: `OTP verified • ready to convert`,
                action: "Convert",
                url: "quick-enquiries.html"
            }))
        ];
    }

    return ctx.quickRows.slice(0, 8).map(q => ({
        title: q.customer_name,
        meta: `${q.quick_status} • ${q.phone}`,
        action: "Open",
        url: "quick-enquiries.html"
    }));
}

function renderWorkspaceQueue(id, rows) {
    const box = document.getElementById(id);
    if (!box) return;

    if (!rows.length) {
        box.innerHTML = `<div class="workspace-empty">No pending operational tasks.</div>`;
        return;
    }

    box.innerHTML = rows.map(row => `
        <div class="workspace-task">
            <div>
                <strong>${safe(row.title || "-")}</strong>
                <small>${safe(row.meta || "")}</small>
            </div>
            <a href="${row.url || "#"}">${safe(row.action || "Open")}</a>
        </div>
    `).join("");
}

window.loadWorkspace = loadWorkspace;
