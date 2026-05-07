const API = window.CRM_API || "https://landing-backend-8gvq.onrender.com/api";
const token = sessionStorage.getItem("token");

let currentReport = null;

if (!token) {
    window.location.href = "login.html";
}

function authHeaders() {
    return {
        Authorization: `Bearer ${token}`
    };
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
    return new Date().toISOString().slice(0, 7);
}

function safe(value) {
    return String(value ?? "-").replace(/[&<>'"]/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[char]));
}

async function request(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();

    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { message: text };
    }

    if (response.status === 401) {
        sessionStorage.clear();
        window.location.href = "login.html";
        return;
    }

    if (!response.ok) {
        console.error("REPORT API ERROR:", {
            status: response.status,
            url,
            response: data
        });
        throw new Error(data.message || `Request failed with status ${response.status}`);
    }

    return data;
}

function handleReportTypeChange() {
    const type = document.getElementById("reportType")?.value || "daily";

    const dailyBox = document.getElementById("dailyBox");
    const monthBox = document.getElementById("monthBox");
    const rangeBoxes = document.querySelectorAll(".range-box");

    if (dailyBox) dailyBox.style.display = type === "daily" ? "block" : "none";
    if (monthBox) monthBox.style.display = type === "monthly" ? "block" : "none";

    rangeBoxes.forEach(box => {
        box.style.display =
            type === "weekly" || type === "custom" ? "block" : "none";
    });
}

function buildReportUrl() {
    const type = document.getElementById("reportType")?.value || "daily";

    if (type === "daily") {
        const date = document.getElementById("reportDate")?.value || today();
        return `${API}/reports/daily?date=${date}`;
    }

    if (type === "monthly") {
        const month = document.getElementById("reportMonth")?.value || currentMonth();
        return `${API}/reports/monthly?month=${month}`;
    }

    const from = document.getElementById("dateFrom")?.value;
    const to = document.getElementById("dateTo")?.value;

    if (!from || !to) {
        alert("Please select from and to date");
        return null;
    }

    return `${API}/reports/${type}?from=${from}&to=${to}`;
}

async function generateReport() {
    try {
        const url = buildReportUrl();
        if (!url) return;

        const data = await request(url, {
            headers: authHeaders()
        });

        currentReport = data;
        renderReport(data);

    } catch (error) {
        alert(error.message);
    }
}

function renderReport(report) {
    const output = document.getElementById("reportOutput");
    if (output) output.style.display = "block";

    const overview = report.overview || {};

    const fields = {
        r_total: overview.total_leads || 0,
        r_hot: overview.hot || 0,
        r_warm: overview.warm || 0,
        r_cold: overview.cold || 0,
        r_booked: overview.booked || 0,
        r_closed: overview.closed || 0,
        r_missed: report.followups?.missed_or_due_followups || 0
    };

    Object.entries(fields).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    });

    const sourceReport = document.getElementById("sourceReport");
    if (sourceReport) {
        sourceReport.innerHTML = (report.source_summary || []).map(row => `
            <tr>
                <td>${safe(row.source)}</td>
                <td>${row.count}</td>
            </tr>
        `).join("");
    }

    const modelReport = document.getElementById("modelReport");
    if (modelReport) {
        modelReport.innerHTML = (report.model_summary || []).map(row => `
            <tr>
                <td>${safe(row.model)}</td>
                <td>${row.count}</td>
            </tr>
        `).join("");
    }

    const userReport = document.getElementById("userReport");
    if (userReport) {
        userReport.innerHTML = (report.user_performance || []).map(row => `
            <tr>
                <td>${safe(row.name)}</td>
                <td>${row.assigned_leads || 0}</td>
                <td>${row.hot_leads || 0}</td>
                <td>${row.test_drives || 0}</td>
                <td>${row.booked || 0}</td>
                <td>${row.closed || 0}</td>
                <td>${row.missed_followups || 0}</td>
            </tr>
        `).join("");
    }

    const leadReport = document.getElementById("leadReport");
    if (leadReport) {
        leadReport.innerHTML = (report.recent_leads || []).map(row => `
            <tr>
                <td>${safe(row.name)}</td>
                <td>${safe(row.phone)}</td>
                <td>${safe(row.car_interest)}</td>
                <td>${safe(row.source)}</td>
                <td>${safe(row.priority)}</td>
                <td>${safe(row.status)}</td>
                <td>${safe(row.assigned_name || "Unassigned")}</td>
            </tr>
        `).join("");
    }

    const whatsappSummary = document.getElementById("whatsappSummary");
    if (whatsappSummary) {
        whatsappSummary.value = report.whatsapp_summary || "";
    }
}

function copyWhatsappSummary() {
    const text = document.getElementById("whatsappSummary")?.value || "";

    if (!text) {
        alert("Generate report first");
        return;
    }

    navigator.clipboard.writeText(text);
    alert("WhatsApp summary copied");
}

function downloadReportCSV() {
    if (!currentReport) {
        alert("Generate report first");
        return;
    }

    const rows = [];

    rows.push(["CRM Report", currentReport.type || "", currentReport.label || ""]);
    rows.push([]);

    rows.push(["Overview"]);
    Object.entries(currentReport.overview || {}).forEach(([key, value]) => {
        rows.push([key, value]);
    });

    rows.push([]);
    rows.push(["Source Summary"]);
    rows.push(["Source", "Count"]);

    (currentReport.source_summary || []).forEach(row => {
        rows.push([row.source, row.count]);
    });

    rows.push([]);
    rows.push(["Sales Performance"]);
    rows.push(["Name", "Assigned", "Hot", "Test Drives", "Booked", "Closed", "Missed"]);

    (currentReport.user_performance || []).forEach(row => {
        rows.push([
            row.name,
            row.assigned_leads,
            row.hot_leads,
            row.test_drives,
            row.booked,
            row.closed,
            row.missed_followups
        ]);
    });

    const csv = rows.map(row =>
        row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `crm-report-${new Date().toISOString().slice(0, 10)}.csv`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
}

window.onload = () => {
    const reportDate = document.getElementById("reportDate");
    const reportMonth = document.getElementById("reportMonth");

    if (reportDate) reportDate.value = today();
    if (reportMonth) reportMonth.value = currentMonth();

    handleReportTypeChange();
};

window.generateReport = generateReport;
window.handleReportTypeChange = handleReportTypeChange;
window.downloadReportCSV = downloadReportCSV;
window.copyWhatsappSummary = copyWhatsappSummary;

console.log("✅ frontend reports.js loaded");