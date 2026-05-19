
let activityRows = [];

if (!token) {
    window.location.href = "login.html";
}

function value(id) { return document.getElementById(id)?.value || ""; }
function setText(id, val) { const el = document.getElementById(id); if (el) el.innerText = val ?? "0"; }

function fmtDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("en-IN");
}

function severityBadge(severity) {
    const s = String(severity || "INFO").toUpperCase();
    return `<span class="badge ${s.toLowerCase()}">${safe(s)}</span>`;
}

async function loadActivityFilters() {
    try {
        const data = await request(`${API}/activity/filters/options`, { headers: authHeaders() });
        const moduleSelect = document.getElementById("moduleFilter");
        const severitySelect = document.getElementById("severityFilter");

        if (moduleSelect) {
            moduleSelect.innerHTML = `<option value="">All Modules</option>` +
                (data.modules || []).map(module => `<option value="${safe(module)}">${safe(module)}</option>`).join("");
        }

        if (severitySelect) {
            severitySelect.innerHTML = `<option value="">All Severity</option>` +
                (data.severities || []).map(severity => `<option value="${safe(severity)}">${safe(severity)}</option>`).join("");
        }
    } catch (err) {
        console.error("Activity filters failed:", err.message);
    }
}

function buildActivityQuery() {
    const params = new URLSearchParams();
    const search = value("activitySearch").trim();
    const moduleName = value("moduleFilter");
    const severity = value("severityFilter");
    const from = value("dateFromFilter");
    const to = value("dateToFilter");

    if (search) params.set("search", search);
    if (moduleName) params.set("module_name", moduleName);
    if (severity) params.set("severity", severity);
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    params.set("limit", "200");
    return params.toString();
}

async function loadActivitySummary() {
    try {
        const data = await request(`${API}/activity/summary`, { headers: authHeaders() });
        const overview = data.overview || {};
        setText("totalActivities", Number(overview.total_activities || 0));
        setText("todayActivities", Number(overview.today_activities || 0));
        setText("activeUsers", Number(overview.active_users || 0));
        setText("activeModules", Number(overview.active_modules || 0));
        setText("warningCount", Number(overview.warning_count || 0));
        setText("criticalCount", Number(overview.critical_count || 0));
        renderMiniAnalytics("moduleActivityList", data.by_module || [], "module_name");
        renderMiniAnalytics("userActivityList", data.by_user || [], "user_name", "user_role");
    } catch (err) {
        toast(err.message || "Failed to load activity summary", true);
    }
}

function renderMiniAnalytics(containerId, rows, labelKey, subKey = null) {
    const box = document.getElementById(containerId);
    if (!box) return;

    if (!rows.length) {
        box.innerHTML = `<div class="empty-state">No data found</div>`;
        return;
    }

    box.innerHTML = rows.map(row => `
        <div class="mini-analytics-item">
            <div>
                <strong>${safe(row[labelKey] || "-")}</strong>
                ${subKey ? `<small>${safe(row[subKey] || "-")}</small>` : ""}
            </div>
            <span>${Number(row.count || 0)}</span>
        </div>
    `).join("");
}

async function loadActivities() {
    try {
        const query = buildActivityQuery();
        activityRows = await request(`${API}/activity?${query}`, { headers: authHeaders() });
        renderActivities();
    } catch (err) {
        toast(err.message || "Failed to load activities", true);
        const tbody = document.getElementById("activityTable");
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Failed to load activity feed</td></tr>`;
    }
}

function renderActivities() {
    const tbody = document.getElementById("activityTable");
    if (!tbody) return;

    if (!activityRows.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No activity records found</td></tr>`;
        return;
    }

    tbody.innerHTML = activityRows.map(row => `
        <tr>
            <td><strong>${fmtDateTime(row.created_at)}</strong></td>
            <td><strong>${safe(row.user_name || "System")}</strong><small>${safe(row.user_role || row.user_email || "-")}</small></td>
            <td><span class="role-pill">${safe(row.module_name || "GENERAL")}</span><small>${safe(row.branch_name || "")}</small></td>
            <td><strong>${safe(row.action || "-")}</strong><small>${safe(row.old_value || "")} ${row.old_value || row.new_value ? "→" : ""} ${safe(row.new_value || "")}</small></td>
            <td>${safe(row.entity_type || "-")}<small>ID: ${safe(row.entity_id || "-")}</small></td>
            <td>${safe(row.lead_name || "-")}<small>${safe(row.lead_phone || "")}</small></td>
            <td>${severityBadge(row.severity)}</td>
            <td><small>${safe(row.remarks || "-")}</small></td>
        </tr>
    `).join("");
}

async function loadActivityDashboard() {
    await loadActivitySummary();
    await loadActivities();
}

window.loadActivities = loadActivities;
window.loadActivityDashboard = loadActivityDashboard;

window.onload = async () => {
    await loadActivityFilters();
    await loadActivityDashboard();
};
