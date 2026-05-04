const API = window.CRM_API || "https://landing-backend-8gvq.onrender.com/api";
const token = sessionStorage.getItem("token");
const user = JSON.parse(sessionStorage.getItem("user") || "{}");

let allLeads = [];
let priorityChart;
let actionChart;

const STATUSES = ["NEW", "CONTACTED", "FOLLOW-UP", "TEST-DRIVE", "BOOKED", "CLOSED", "LOST"];
const ZONE_IDS = {
    "NEW": "zone-new",
    "CONTACTED": "zone-contacted",
    "FOLLOW-UP": "zone-follow-up",
    "TEST-DRIVE": "zone-test-drive",
    "BOOKED": "zone-booked",
    "CLOSED": "zone-closed",
    "LOST": "zone-lost"
};

if (!token) window.location.href = "login.html";
if (user.role === "admin") window.location.href = "admin.html";

function authHeaders(json = false) {
    const headers = { Authorization: `Bearer ${token}` };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
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

function fmtDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
}

function cleanPhone(phone) {
    return String(phone || "").replace(/\D/g, "").slice(-10);
}

function toast(message, error = false) {
    let el = document.getElementById("crmToast");
    if (!el) {
        el = document.createElement("div");
        el.id = "crmToast";
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = `crm-toast show ${error ? "error" : ""}`;
    setTimeout(() => { el.className = "crm-toast"; }, 2400);
}

async function request(url, options = {}) {
    const response = await fetch(url, options);
    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    if (response.status === 401) return logout();
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
}

async function loadLeads() {
    const params = new URLSearchParams();
    const priority = document.getElementById("filter")?.value || "";
    const search = document.getElementById("searchInput")?.value.trim() || "";
    if (priority) params.set("priority", priority);
    if (search) params.set("search", search);

    const query = params.toString();
    allLeads = await request(`${API}/leads${query ? `?${query}` : ""}`, { headers: authHeaders() });

    renderTodayFollowups(allLeads);
    renderPipeline(allLeads);
    renderTable(allLeads);
}

function renderTodayFollowups(leads) {
    const box = document.getElementById("todayFollowups");
    if (!box) return;

    const today = new Date().toISOString().slice(0, 10);
    const due = leads.filter(lead => lead.next_followup_at && String(lead.next_followup_at).startsWith(today));

    if (!due.length) {
        box.innerHTML = `<div class="empty-state">No follow-ups scheduled for today</div>`;
        return;
    }

    box.innerHTML = due.map(lead => `
        <div class="followup-card">
            <strong>${safe(lead.name)}</strong>
            <span>${safe(lead.phone)} • ${safe(lead.car_interest || "Not Selected")}</span>
            <small>${fmtDate(lead.next_followup_at)}</small>
        </div>
    `).join("");
}

function renderPipeline(leads) {
    const counters = Object.fromEntries(STATUSES.map(status => [status, 0]));
    STATUSES.forEach(status => {
        const zone = document.getElementById(ZONE_IDS[status]);
        if (zone) zone.innerHTML = "";
    });

    leads.forEach(lead => {
        const status = STATUSES.includes(lead.status) ? lead.status : "NEW";
        counters[status]++;
        const zone = document.getElementById(ZONE_IDS[status]);
        if (!zone) return;

        const card = document.createElement("div");
        card.className = `lead-card ${String(lead.priority || "COLD").toLowerCase()}`;
        card.draggable = true;
        card.dataset.id = lead.id;
        card.innerHTML = `
            <strong>${safe(lead.name)}</strong>
            <div class="lead-meta">${safe(lead.phone)} • ${safe(lead.car_interest || "Not Selected")}</div>
            <div class="lead-meta">${safe(lead.source || "WEBSITE")}</div>
        `;
        card.addEventListener("dragstart", event => event.dataTransfer.setData("id", lead.id));
        zone.appendChild(card);
    });

    STATUSES.forEach(status => {
        const title = document.querySelector(`[data-status="${status}"] h3`);
        if (title) title.innerText = `${status} (${counters[status]})`;
    });
}

function renderTable(leads) {
    const tbody = document.querySelector("#leadTable tbody");
    if (!tbody) return;

    if (!leads.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">📭 No assigned leads found</td></tr>`;
        return;
    }

    tbody.innerHTML = leads.map(lead => {
        const priorityClass = String(lead.priority || "COLD").toLowerCase();
        const phone = cleanPhone(lead.phone);
        return `
            <tr class="${priorityClass}">
                <td><strong>${safe(lead.name)}</strong><small>${fmtDate(lead.created_at)}</small></td>
                <td>${safe(lead.phone)}<small>Alt: ${safe(lead.alternate_phone || "-")}</small></td>
                <td>${safe(lead.car_interest || "Not Selected")}<small>Variant: ${safe(lead.variant_interest || "-")}</small></td>
                <td>${safe(lead.source || "WEBSITE")}<small>${safe(lead.action_type || lead.lead_type || "ENQUIRY")}</small></td>
                <td><span class="badge ${priorityClass}">${safe(lead.priority || "COLD")}</span><small>Score: ${Number(lead.score || 0)}</small></td>
                <td>
                    <select onchange="updateStatus(${lead.id}, this.value)">
                        ${STATUSES.map(status => `<option value="${status}" ${lead.status === status ? "selected" : ""}>${status}</option>`).join("")}
                    </select>
                </td>
                <td>
                    <button onclick="openFollowup(${lead.id})" class="followup-btn">📞 Follow-up</button>
                    <small>Next: ${fmtDate(lead.next_followup_at)}</small>
                    <small>Count: ${lead.followup_count || 0}</small>
                </td>
                <td class="actions">
                    <a href="tel:${phone}" title="Call">📞</a>
                    <a href="https://wa.me/91${phone}" target="_blank" title="WhatsApp">💬</a>
                </td>
            </tr>
        `;
    }).join("");
}

function initDragDrop() {
    document.querySelectorAll(".dropzone").forEach(zone => {
        zone.addEventListener("dragover", event => event.preventDefault());
        zone.addEventListener("drop", async event => {
            event.preventDefault();
            const id = event.dataTransfer.getData("id");
            const status = zone.parentElement.dataset.status;
            await updateStatus(id, status);
        });
    });
}

async function updateStatus(id, status) {
    try {
        await request(`${API}/lead/${id}/status`, {
            method: "PUT",
            headers: authHeaders(true),
            body: JSON.stringify({ status })
        });
        toast("Status updated");
        await Promise.all([loadLeads(), loadAnalytics()]);
    } catch (error) {
        toast(error.message, true);
    }
}

function openFollowup(id) {
    document.getElementById("followupLeadId").value = id;
    document.getElementById("callStatus").value = "CONNECTED";
    document.getElementById("customerResponse").value = "INTERESTED";
    document.getElementById("nextFollowupAt").value = "";
    document.getElementById("followupRemarks").value = "";

    document.getElementById("followupModal").classList.add("show");
}

function closeFollowupModal() {
    document.getElementById("followupModal").classList.remove("show");
}

async function submitFollowup() {
    const id = document.getElementById("followupLeadId").value;
    const call_status = document.getElementById("callStatus").value;
    const customer_response = document.getElementById("customerResponse").value;
    const next_followup_at = document.getElementById("nextFollowupAt").value;
    const remarks = document.getElementById("followupRemarks").value;

    if (!next_followup_at) {
        toast("Please select next follow-up date", true);
        return;
    }

    try {
        await request(`${API}/lead/${id}/followup`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify({
                call_status,
                customer_response,
                next_followup_at,
                remarks
            })
        });

        toast("Follow-up saved");
        closeFollowupModal();

        await Promise.all([
            loadLeads(),
            loadAnalytics()
        ]);

    } catch (e) {
        toast(e.message, true);
    }
}
async function loadAnalytics() {
    const data = await request(`${API}/analytics`, { headers: authHeaders() });

    ["total", "hot", "warm", "cold", "enquiry", "testdrive", "booked", "closed", "today_followups", "overdue_followups"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = Number(data[id] || 0);
    });

    if (typeof Chart === "undefined") return;
    if (priorityChart) priorityChart.destroy();
    if (actionChart) actionChart.destroy();

    const priorityCanvas = document.getElementById("priorityChart");
    if (priorityCanvas) {
        priorityChart = new Chart(priorityCanvas, {
            type: "doughnut",
            data: { labels: ["COLD", "HOT", "WARM"], datasets: [{ data: [data.cold || 0, data.hot || 0, data.warm || 0] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const actionCanvas = document.getElementById("actionChart");
    if (actionCanvas) {
        actionChart = new Chart(actionCanvas, {
            type: "bar",
            data: {
                labels: ["Enquiry", "Test Drive", "Call", "WhatsApp", "Booked", "Closed"],
                datasets: [{ label: "Leads", data: [data.enquiry || 0, data.testdrive || 0, data.call || 0, data.whatsapp || 0, data.booked || 0, data.closed || 0] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }
}

function logout() {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    window.location.href = "login.html";
}

window.onload = async () => {
    const userInfo = document.getElementById("userInfo");
    if (userInfo) userInfo.innerText = `👤 ${user.name || "Sales User"} (${user.role || "sales"})`;
    initDragDrop();
    try {
        await Promise.all([loadLeads(), loadAnalytics()]);
        setInterval(() => Promise.all([loadLeads(), loadAnalytics()]).catch(console.error), 50000);
    } catch (error) {
        toast(error.message, true);
    }
};
