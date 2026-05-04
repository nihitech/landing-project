const API = window.CRM_API || "https://landing-backend-8gvq.onrender.com/api";
const token = sessionStorage.getItem("token");
const user = JSON.parse(sessionStorage.getItem("user") || "{}");

let users = [];
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
if (user.role && user.role !== "admin") window.location.href = "user-dashboard.html";

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

async function loadUsers() {
    users = await request(`${API}/auth/users`, { headers: authHeaders() });
    renderUsersTable();
}

async function loadLeads() {
    const params = new URLSearchParams();
    const priority = document.getElementById("filter")?.value || "";
    const source = document.getElementById("sourceFilter")?.value || "";
    const search = document.getElementById("searchInput")?.value.trim() || "";

    if (priority) params.set("priority", priority);
    if (source) params.set("source", source);
    if (search) params.set("search", search);

    const query = params.toString();
    allLeads = await request(`${API}/leads${query ? `?${query}` : ""}`, { headers: authHeaders() });

    renderWorkload(allLeads);
    renderTodayFollowups(allLeads);
    renderPipeline(allLeads);
    renderTable(allLeads);
}

function renderWorkload(leads) {
    const box = document.getElementById("workloadCards");
    if (!box) return;

    const salesUsers = users.filter(u => u.role === "sales");
    if (!salesUsers.length) {
        box.innerHTML = `<div class="empty-state">No sales users created yet</div>`;
        return;
    }

    box.innerHTML = salesUsers.map(sales => {
        const assigned = leads.filter(lead => Number(lead.assigned_to) === Number(sales.id));
        const hot = assigned.filter(lead => lead.priority === "HOT").length;
        const due = assigned.filter(lead => lead.next_followup_at && new Date(lead.next_followup_at) <= new Date()).length;
        return `
            <div class="workload-card">
                <h3>${safe(sales.name)}</h3>
                <p>${safe(sales.email)}</p>
                <strong>${assigned.length}</strong>
                <span>Assigned Leads</span>
                <small>🔥 ${hot} hot • 📞 ${due} due</small>
            </div>
        `;
    }).join("");
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
            <small>Assigned: ${safe(lead.assigned_name || "Unassigned")} • ${fmtDate(lead.next_followup_at)}</small>
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
            <div class="lead-meta">${safe(lead.source || "WEBSITE")} • ${safe(lead.assigned_name || "Unassigned")}</div>
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
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">📭 No leads found</td></tr>`;
        return;
    }

    const salesOptions = lead => `<option value="">Unassigned</option>` + users
        .filter(u => u.role === "sales")
        .map(u => `<option value="${u.id}" ${Number(lead.assigned_to) === Number(u.id) ? "selected" : ""}>${safe(u.name)}</option>`)
        .join("");

    tbody.innerHTML = leads.map(lead => {
        const priorityClass = String(lead.priority || "COLD").toLowerCase();
        const phone = cleanPhone(lead.phone);
        return `
            <tr class="${priorityClass}">
                <td>
                    <strong>${safe(lead.name)}</strong>
                    <small>${fmtDate(lead.created_at)}</small>
                    <small>Family: ${safe(lead.family_members || "-")}</small>
                </td>
                <td>
                    ${safe(lead.phone)}
                    <small>Alt: ${safe(lead.alternate_phone || "-")}</small>
                    <small>${safe(lead.area || "")} ${safe(lead.district || "")}</small>
                </td>
                <td>
                    ${safe(lead.car_interest || "Not Selected")}
                    <small>Variant: ${safe(lead.variant_interest || "-")}</small>
                    <small>Budget: ${safe(lead.budget_range || "-")}</small>
                </td>
                <td>
                    ${safe(lead.source || "WEBSITE")}
                    <small>${safe(lead.action_type || lead.lead_type || "ENQUIRY")}</small>
                    <small>${safe(lead.campaign_name || "-")}</small>
                </td>
                <td>
                    <span class="badge ${priorityClass}">${safe(lead.priority || "COLD")}</span>
                    <small>Score: ${Number(lead.score || 0)}</small>
                </td>
                <td>
                    <select onchange="updateStatus(${lead.id}, this.value)">
                        ${STATUSES.map(status => `<option value="${status}" ${lead.status === status ? "selected" : ""}>${status}</option>`).join("")}
                    </select>
                </td>
                <td><select onchange="assignLead(${lead.id}, this.value)">${salesOptions(lead)}</select></td>
                <td>
                    <td>
                        <button onclick="openFollowup(${l.id})" class="followup-btn">
                            📞 Follow-up
                        </button>
                    </td>
                    <small>Next: ${fmtDate(lead.next_followup_at)}</small>
                    <small>Count: ${lead.followup_count || 0}</small>
                </td>
                <td class="actions">
                    <button onclick="openLeadDetails(${l.id})" class="view-btn">View</button>
                    <a href="tel:${phone}" title="Call">📞</a>
                    <a href="https://wa.me/91${phone}" target="_blank" title="WhatsApp">💬</a>
                </td>
            </tr>
        `;
    }).join("");
}

async function openLeadDetails(id) {
    const lead = allLeads.find(l => Number(l.id) === Number(id));
    if (!lead) {
        toast("Lead not found", true);
        return;
    }

    let followups = [];

    try {
        followups = await request(`${API}/lead/${id}/followups`, {
            headers: authHeaders()
        });
    } catch (e) {
        console.error("Follow-up history error:", e);
    }

    document.getElementById("leadDetailContent").innerHTML = `
        <div class="detail-grid">
            <div><strong>Name</strong><span>${safe(lead.name)}</span></div>
            <div><strong>Phone</strong><span>${safe(lead.phone)}</span></div>
            <div><strong>Email</strong><span>${safe(lead.email)}</span></div>
            <div><strong>Car</strong><span>${safe(lead.car_interest)}</span></div>
            <div><strong>Action</strong><span>${safe(lead.action_type)}</span></div>
            <div><strong>Priority</strong><span>${safe(lead.priority)}</span></div>
            <div><strong>Status</strong><span>${safe(lead.status)}</span></div>
            <div><strong>Assigned To</strong><span>${safe(lead.assigned_name || "Unassigned")}</span></div>
            <div><strong>Next Follow-up</strong><span>${lead.next_followup_at ? new Date(lead.next_followup_at).toLocaleString() : "-"}</span></div>
            <div><strong>Follow-up Count</strong><span>${lead.followup_count || 0}</span></div>
        </div>

        <div class="detail-notes">
            <strong>Notes</strong>
            <p>${safe(lead.notes || "No notes added")}</p>
        </div>

        <div class="followup-history">
            <h3>📞 Follow-up History</h3>
            ${
                followups.length
                ? followups.map(f => `
                    <div class="history-item">
                        <div class="history-top">
                            <strong>${safe(f.call_status || "-")}</strong>
                            <span>${f.created_at ? new Date(f.created_at).toLocaleString() : ""}</span>
                        </div>
                        <p>${safe(f.customer_response || "-")}</p>
                        <small>Next: ${f.next_followup_at ? new Date(f.next_followup_at).toLocaleString() : "-"}</small>
                        <small>By: ${safe(f.user_name || "User")}</small>
                        <div>${safe(f.remarks || "")}</div>
                    </div>
                `).join("")
                : `<div class="empty-state">No follow-up history yet</div>`
            }
        </div>
    `;

    document.getElementById("leadDetailModal").classList.add("show");
}
function closeLeadDetails() {
    document.getElementById("leadDetailModal").classList.remove("show");
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

async function assignLead(id, userId) {
    try {
        await request(`${API}/lead/${id}/assign`, {
            method: "PUT",
            headers: authHeaders(true),
            body: JSON.stringify({ user_id: userId || null })
        });
        toast(userId ? "Lead assigned" : "Lead unassigned");
        await Promise.all([loadLeads(), loadAnalytics()]);
    } catch (error) {
        toast(error.message, true);
    }
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
function renderUsersTable() {
    const tbody = document.querySelector("#userTable tbody");
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No users found</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(u => `
        <tr>
            <td>${safe(u.name)}</td>
            <td>${safe(u.email)}</td>
            <td><span class="role-pill">${safe(u.role)}</span></td>
            <td><button onclick="deleteUser(${u.id})" class="delete-user-btn" ${Number(u.id) === Number(user.id) ? "disabled" : ""}>Delete</button></td>
        </tr>
    `).join("");
}

async function createUser() {
    const payload = {
        name: document.getElementById("uname").value.trim(),
        email: document.getElementById("uemail").value.trim(),
        password: document.getElementById("upassword").value.trim(),
        role: document.getElementById("urole").value
    };

    if (!payload.name || !payload.email || !payload.password) {
        return toast("All user fields are required", true);
    }

    try {
        await request(`${API}/auth/register`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });
        ["uname", "uemail", "upassword"].forEach(id => document.getElementById(id).value = "");
        toast("User added");
        await loadUsers();
    } catch (error) {
        toast(error.message, true);
    }
}

async function deleteUser(id) {
    if (!confirm("Delete this user? Assigned leads will become unassigned.")) return;
    try {
        await request(`${API}/auth/user/${id}`, { method: "DELETE", headers: authHeaders() });
        toast("User deleted");
        await Promise.all([loadUsers(), loadLeads(), loadAnalytics()]);
    } catch (error) {
        toast(error.message, true);
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
            data: {
                labels: ["COLD", "HOT", "WARM"],
                datasets: [{ data: [data.cold || 0, data.hot || 0, data.warm || 0] }]
            },
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

function downloadLeadsCSV() {
    if (!allLeads.length) return toast("No leads available to download", true);
    const headers = ["Name", "Phone", "Alt Phone", "Email", "Car", "Variant", "Source", "Campaign", "Priority", "Score", "Status", "Assigned To", "Next Follow-up", "Created At"];
    const rows = allLeads.map(l => [
        l.name, l.phone, l.alternate_phone, l.email, l.car_interest, l.variant_interest,
        l.source, l.campaign_name, l.priority, l.score, l.status, l.assigned_name || "Unassigned", l.next_followup_at, l.created_at
    ]);
    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("CSV downloaded");
}

function logout() {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    window.location.href = "login.html";
}

window.onload = async () => {
    const userInfo = document.getElementById("userInfo");
    if (userInfo) userInfo.innerText = `👤 ${user.name || "Admin"} (${user.role || "admin"})`;
    initDragDrop();
    try {
        await loadUsers();
        await Promise.all([loadLeads(), loadAnalytics()]);
        setInterval(() => Promise.all([loadLeads(), loadAnalytics()]).catch(console.error), 50000);
    } catch (error) {
        toast(error.message, true);
    }
};
