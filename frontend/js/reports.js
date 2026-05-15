let currentReport = null;

if (!token) {
    window.location.href = "login.html";
}

function authHeaders() {
    return {
        Authorization: `Bearer ${token}`
    };
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

    let data = {};
    const text = await response.text();

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
function today() {
    return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
    return new Date().toISOString().slice(0, 7);
}

function handleReportTypeChange() {
    const type = document.getElementById("reportType").value;

    document.getElementById("dailyBox").style.display =
        type === "daily" ? "block" : "none";

    document.getElementById("monthBox").style.display =
        type === "monthly" ? "block" : "none";

    document.querySelectorAll(".range-box").forEach(box => {
        box.style.display =
            type === "weekly" || type === "custom" ? "block" : "none";
    });
}

function buildReportUrl() {
    const type = document.getElementById("reportType").value;

    if (type === "daily") {
        const date = document.getElementById("reportDate").value || today();
        return `${API}/reports/daily?date=${date}`;
    }

    if (type === "monthly") {
        const month = document.getElementById("reportMonth").value || currentMonth();
        return `${API}/reports/monthly?month=${month}`;
    }

    const from = document.getElementById("dateFrom").value;
    const to = document.getElementById("dateTo").value;

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
    document.getElementById("reportOutput").style.display = "block";

    const o = report.overview || {};

    document.getElementById("r_total").innerText = o.total_leads || 0;
    document.getElementById("r_hot").innerText = o.hot || 0;
    document.getElementById("r_warm").innerText = o.warm || 0;
    document.getElementById("r_cold").innerText = o.cold || 0;
    document.getElementById("r_booked").innerText = o.booked || 0;
    document.getElementById("r_closed").innerText = o.closed || 0;
    document.getElementById("r_missed").innerText =
        report.followups?.missed_or_due_followups || 0;

    document.getElementById("sourceReport").innerHTML =
        (report.source_summary || []).map(row => `
            <tr>
                <td>${safe(row.source)}</td>
                <td>${row.count}</td>
            </tr>
        `).join("");

    document.getElementById("modelReport").innerHTML =
        (report.model_summary || []).map(row => `
            <tr>
                <td>${safe(row.model)}</td>
                <td>${row.count}</td>
            </tr>
        `).join("");

    document.getElementById("userReport").innerHTML =
        (report.user_performance || []).map(row => `
            <tr>
                <td>${safe(row.name)}</td>
                <td>${row.assigned_leads}</td>
                <td>${row.hot_leads}</td>
                <td>${row.test_drives}</td>
                <td>${row.booked}</td>
                <td>${row.closed}</td>
                <td>${row.missed_followups}</td>
            </tr>
        `).join("");

    document.getElementById("leadReport").innerHTML =
        (report.recent_leads || []).map(row => `
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

    document.getElementById("whatsappSummary").value =
        report.whatsapp_summary || "";
}

function copyWhatsappSummary() {
    const text = document.getElementById("whatsappSummary").value;

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

    rows.push(["CRM Report", currentReport.type, currentReport.label]);
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
function downloadReportPDF() {
    const reportOutput = document.getElementById("reportOutput");

    if (!currentReport || !reportOutput || reportOutput.style.display === "none") {
        alert("Generate report first");
        return;
    }

    const printWindow = window.open("", "_blank");

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>CRM Report</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 24px;
                    color: #111827;
                    background: #ffffff;
                }

                h1, h2, h3 {
                    color: #111827;
                }

                .print-header {
                    border-bottom: 3px solid #111827;
                    padding-bottom: 14px;
                    margin-bottom: 22px;
                }

                .print-header h1 {
                    margin: 0;
                    font-size: 26px;
                }

                .print-header p {
                    margin: 6px 0 0;
                    color: #555;
                }

                .report-kpi-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 12px;
                    margin-bottom: 22px;
                }

                .report-kpi-card {
                    border: 1px solid #ddd;
                    border-left: 5px solid #111827;
                    border-radius: 10px;
                    padding: 14px;
                }

                .report-kpi-card span {
                    display: block;
                    font-size: 12px;
                    color: #555;
                    margin-bottom: 6px;
                }

                .report-kpi-card strong {
                    font-size: 24px;
                }

                .report-card {
                    margin-bottom: 24px;
                    page-break-inside: avoid;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                }

                th, td {
                    border: 1px solid #ddd;
                    padding: 9px;
                    font-size: 12px;
                    text-align: left;
                }

                th {
                    background: #f1f5f9;
                }

                textarea {
                    width: 100%;
                    border: 1px solid #ddd;
                    padding: 12px;
                    font-family: Arial, sans-serif;
                    font-size: 12px;
                }

                button, .report-actions {
                    display: none !important;
                }

                @media print {
                    body {
                        padding: 12px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <h1>CRM Management Report</h1>
                <p>Generated on ${new Date().toLocaleString("en-IN")}</p>
                <p>Report Type: ${(currentReport.type || "").toUpperCase()} | Period: ${currentReport.label || ""}</p>
            </div>

            ${reportOutput.innerHTML}
        </body>
        </html>
    `);

    printWindow.document.close();

    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
    };
}
async function sendReportEmail() {
    if (!currentReport) {
        alert("Generate report first");
        return;
    }

    const receiver = prompt(
        "Enter receiver email",
        "manager@example.com"
    );

    if (!receiver) return;

    try {
        await request(`${API}/reports/send-email`, {
            method: "POST",
            headers: {
                ...authHeaders(),
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                report_type: currentReport.type,
                report_label: currentReport.label,
                receiver_email: receiver,
                whatsapp_summary: currentReport.whatsapp_summary
            })
        });

        alert("Report email sent successfully");

    } catch (error) {
        alert(error.message || "Email send failed");
    }
}
async function loadReportEmailSettings() {
    try {
        const data = await request(`${API}/reports/email-settings/list`, {
            headers: authHeaders()
        });

        const tbody = document.getElementById("reportEmailSettingsTable");
        if (!tbody) return;

        tbody.innerHTML = (data || []).map(row => `
            <tr>
                <td>${safe(row.report_type)}</td>
                <td>${safe(row.receiver_email)}</td>
                <td>${safe(row.cc_email || "-")}</td>
                <td>${row.is_active ? "Active" : "Inactive"}</td>
                <td>
                    <button onclick='editReportEmailSetting(${JSON.stringify(row)})' class="copy-btn">Edit</button>
                    <button onclick="deleteReportEmailSetting(${row.id})" class="danger-btn">Delete</button>
                </td>
            </tr>
        `).join("");

    } catch (error) {
        console.error("Load report email settings failed:", error.message);
    }
}

async function saveReportEmailSetting() {
    const settingId = document.getElementById("settingId").value;
    const reportType = document.getElementById("settingReportType").value;
    const receiverEmail = document.getElementById("settingReceiverEmail").value.trim();
    const ccEmail = document.getElementById("settingCcEmail").value.trim();
    const isActive = document.getElementById("settingIsActive").value === "true";

    if (!receiverEmail) {
        alert("Receiver email is required");
        return;
    }

    const url = settingId
        ? `${API}/reports/email-settings/${settingId}`
        : `${API}/reports/email-settings`;

    const method = settingId ? "PUT" : "POST";

    try {
        await request(url, {
            method,
            headers: {
                ...authHeaders(),
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                report_type: reportType,
                receiver_email: receiverEmail,
                cc_email: ccEmail,
                is_active: isActive
            })
        });

        alert(settingId ? "Report email setting updated" : "Report email setting saved");

        resetReportEmailSettingForm();
        await loadReportEmailSettings();

    } catch (error) {
        alert(error.message || "Failed to save email setting");
    }
}
function editReportEmailSetting(row) {
    document.getElementById("settingId").value = row.id;
    document.getElementById("settingReportType").value = row.report_type;
    document.getElementById("settingReceiverEmail").value = row.receiver_email || "";
    document.getElementById("settingCcEmail").value = row.cc_email || "";
    document.getElementById("settingIsActive").value = row.is_active ? "true" : "false";
}

function resetReportEmailSettingForm() {
    document.getElementById("settingId").value = "";
    document.getElementById("settingReceiverEmail").value = "";
    document.getElementById("settingCcEmail").value = "";
    document.getElementById("settingIsActive").value = "true";
}

async function deleteReportEmailSetting(id) {
    if (!confirm("Delete this report email setting?")) return;

    try {
        await request(`${API}/reports/email-settings/${id}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        alert("Report email setting deleted");
        await loadReportEmailSettings();

    } catch (error) {
        alert(error.message || "Failed to delete setting");
    }
}
async function loadReportLogs() {
    try {
        const data = await request(`${API}/reports/logs/list`, {
            headers: authHeaders()
        });

        const tbody = document.getElementById("reportLogsTable");
        if (!tbody) return;

        tbody.innerHTML = (data || []).map(row => `
            <tr>
                <td>${safe(new Date(row.created_at).toLocaleString("en-IN"))}</td>
                <td>${safe(row.report_type)}</td>
                <td>${safe(row.sent_to_email || "-")}</td>
                <td>${safe(row.status)}</td>
                <td>${safe(row.trigger_type || "-")}</td>
                <td>${safe(row.triggered_by_name || "System")}</td>
            </tr>
        `).join("");

    } catch (error) {
        console.error("Load report logs failed:", error.message);
    }
}
window.onload = () => {
    const reportDate = document.getElementById("reportDate");
    const reportMonth = document.getElementById("reportMonth");
    if (reportDate) reportDate.value = today();
    if (reportMonth) reportMonth.value = currentMonth();
    handleReportTypeChange();
    loadReportEmailSettings();
    loadReportLogs();
};

// Expose report actions for inline onclick handlers in reports.html
window.generateReport = generateReport;
window.handleReportTypeChange = handleReportTypeChange;
window.downloadReportPDF = downloadReportPDF;
window.downloadReportCSV = downloadReportCSV;
window.copyWhatsappSummary = copyWhatsappSummary;
window.sendReportEmail = sendReportEmail;
window.loadReportEmailSettings = loadReportEmailSettings;
window.saveReportEmailSetting = saveReportEmailSetting;
window.editReportEmailSetting = editReportEmailSetting;
window.deleteReportEmailSetting = deleteReportEmailSetting;
window.resetReportEmailSettingForm = resetReportEmailSettingForm;
window.loadReportLogs = loadReportLogs;
console.log("✅ frontend reports.js loaded");
