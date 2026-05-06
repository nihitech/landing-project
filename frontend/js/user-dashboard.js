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
const VEHICLE_DATA = {
    ICE: {
        fuelTypes: ["PETROL", "DIESEL"],
        models: {
            "XUV700": ["MX", "AX3", "AX5", "AX7", "AX7L"],
            "Scorpio N": ["Z2", "Z4", "Z6", "Z8", "Z8L"],
            "Scorpio Classic": ["S", "S11"],
            "Thar": ["AX OPT", "LX"],
            "Thar ROXX": ["MX1", "MX3", "AX3L", "MX5", "AX5L", "AX7L"],
            "XUV 3XO": ["MX1", "MX2", "MX2 Pro", "MX3", "MX3 Pro", "AX5", "AX5L", "AX7", "AX7L"],
            "Bolero": ["B4", "B6", "B6 OPT"],
            "Bolero Neo": ["N4", "N8", "N10", "N10 OPT"]
        }
    },
    EV: {
        fuelTypes: ["ELECTRIC"],
        models: {
            "XUV400 EV": ["EC", "EL"],
            "BE 6": ["Pack One", "Pack One Above", "Pack Two", "Pack Three"],
            "XEV 9e": ["Pack One", "Pack Two", "Pack Three"]
        }
    }
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

    return date.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
}
function dateKeyIST(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}`;
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
function renderOverdueFollowups(leads) {

    const box = document.getElementById("overdueFollowups");

    if (!box) return;

    const now = new Date();

    const overdue = leads.filter(lead => {

        if (!lead.next_followup_at) return false;

        const next = new Date(lead.next_followup_at);

        return (
            next < now &&
            !["CLOSED", "LOST"].includes(lead.status)
        );
    });

    if (!overdue.length) {
        box.innerHTML = `
            <div class="empty-state">
                ✅ No missed follow-ups
            </div>
        `;
        return;
    }

    box.innerHTML = overdue.map(lead => {

        const phone = cleanPhone(lead.phone);

        const diffMs = now - new Date(lead.next_followup_at);

        const hours = Math.floor(diffMs / (1000 * 60 * 60));

        return `
            <div class="overdue-card">

                <div class="overdue-top">
                    <strong>${safe(lead.name)}</strong>
                    <span>${hours} hrs overdue</span>
                </div>

                <p>${safe(lead.phone)}</p>

                <small>
                    ${safe(lead.car_interest || "Not Selected")}
                </small>

                <small>
                    Follow-up was due:
                    ${fmtDate(lead.next_followup_at)}
                </small>

                <div class="overdue-actions">
                    <a href="tel:${phone}">📞 Call</a>

                    <a href="https://wa.me/91${phone}"
                       target="_blank">
                       💬 WhatsApp
                    </a>

                    <button onclick="openFollowup(${lead.id})">
                        Reschedule
                    </button>
                </div>

            </div>
        `;
    }).join("");
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
    renderOverdueFollowups(allLeads);
    renderPipeline(allLeads);
    renderTable(allLeads);
}

function renderTodayFollowups(leads) {
    const box = document.getElementById("todayFollowups");
    if (!box) return;

    const today = dateKeyIST(new Date());
    const due = leads.filter(lead => dateKeyIST(lead.next_followup_at) === today);

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

function openEnquiryModal(id) {
    const lead = allLeads.find(l => Number(l.id) === Number(id));

    if (!lead) return toast("Lead not found", true);

    document.getElementById("enquiryLeadId").value = id;

    document.getElementById("e_name").value = lead.name || "";
    document.getElementById("e_phone").value = lead.phone || "";
    document.getElementById("e_alt_phone").value = lead.alternate_phone || "";
    document.getElementById("e_email").value = lead.email || "";

    document.getElementById("e_area").value = lead.area || "";
    document.getElementById("e_district").value = lead.district || "";
    document.getElementById("e_profession").value = lead.profession || "";
    document.getElementById("e_family").value = lead.family_members || "";

    document.getElementById("e_budget").value = lead.budget_range || "";
    document.getElementById("e_timeline").value = lead.purchase_timeline || "";
    document.getElementById("e_exchange").value = lead.exchange_vehicle || "";
    document.getElementById("e_finance").value = lead.finance_required || "";

    document.getElementById("e_testdrive").value = dateKeyIST(lead.test_drive_date);
    document.getElementById("e_visit").value = dateKeyIST(lead.showroom_visit_date);
    document.getElementById("e_booking").value = dateKeyIST(lead.booking_expected_date);

    document.getElementById("e_notes").value = lead.notes || lead.followup_notes || "";

    document.getElementById("e_vehicle_category").value = lead.vehicle_category || "";
    loadVehicleModels();
    document.getElementById("e_fuel_type").value = lead.fuel_type || "";
    document.getElementById("e_car").value = lead.car_interest || "";
    loadVehicleVariants();
    document.getElementById("e_variant").value = lead.variant_interest || "";

    document.getElementById("enquiryModal").classList.add("show");
}
function closeEnquiryModal() {
    document.getElementById("enquiryModal").classList.remove("show");
}
async function saveEnquiry() {

    const id = document.getElementById("enquiryLeadId").value;

    const payload = {
        name: document.getElementById("e_name").value,
        phone: document.getElementById("e_phone").value,
        alternate_phone: document.getElementById("e_alt_phone").value,
        email: document.getElementById("e_email").value,

        area: document.getElementById("e_area").value,
        district: document.getElementById("e_district").value,
        profession: document.getElementById("e_profession").value,
        family_members: document.getElementById("e_family").value,
        vehicle_category: document.getElementById("e_vehicle_category").value,
        fuel_type: document.getElementById("e_fuel_type").value,
        car_interest: document.getElementById("e_car").value,
        variant_interest: document.getElementById("e_variant").value,
        budget_range: document.getElementById("e_budget").value,
        purchase_timeline: document.getElementById("e_timeline").value,

        exchange_vehicle: document.getElementById("e_exchange").value,
        finance_required: document.getElementById("e_finance").value,

        test_drive_date: document.getElementById("e_testdrive").value,
        showroom_visit_date: document.getElementById("e_visit").value,
        booking_expected_date: document.getElementById("e_booking").value,

        notes: document.getElementById("e_notes").value,
        lead_type: "COMPLETE_ENQUIRY",
        action_type: "COMPLETE_ENQUIRY"
    };

    try {

        await request(`${API}/lead/${id}`, {
            method: "PUT",
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast("Enquiry saved successfully");

        closeEnquiryModal();

        await Promise.all([
            loadLeads(),
            loadAnalytics()
        ]);

    } catch (e) {
        toast(e.message, true);
    }
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
                    <button onclick="openLeadDetails(${lead.id})" class="view-btn">View</button>
                    <button onclick="openEnquiryModal(${lead.id})" class="enquiry-btn">
                        📝 Enquiry
                    </button>
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
            <div><strong>Alternate Phone</strong><span>${safe(lead.alternate_phone || "-")}</span></div>
            <div><strong>Email</strong><span>${safe(lead.email || "-")}</span></div>

            <div><strong>Area</strong><span>${safe(lead.area || "-")}</span></div>
            <div><strong>District</strong><span>${safe(lead.district || "-")}</span></div>
            <div><strong>Profession</strong><span>${safe(lead.profession || "-")}</span></div>
            <div><strong>Family Members</strong><span>${safe(lead.family_members || "-")}</span></div>

            <div><strong>Vehicle Category</strong><span>${safe(lead.vehicle_category || "-")}</span></div>
            <div><strong>Fuel Type</strong><span>${safe(lead.fuel_type || "-")}</span></div>
            <div><strong>Car Interest</strong><span>${safe(lead.car_interest || "-")}</span></div>
            <div><strong>Variant Interest</strong><span>${safe(lead.variant_interest || "-")}</span></div>
            <div><strong>Budget Range</strong><span>${safe(lead.budget_range || "-")}</span></div>
            <div><strong>Purchase Timeline</strong><span>${safe(lead.purchase_timeline || "-")}</span></div>

            <div><strong>Exchange Vehicle</strong><span>${safe(lead.exchange_vehicle || "-")}</span></div>
            <div><strong>Finance Required</strong><span>${safe(lead.finance_required || "-")}</span></div>
            <div><strong>Test Drive Date</strong><span>${fmtDate(lead.test_drive_date)}</span></div>
            <div><strong>Showroom Visit Date</strong><span>${fmtDate(lead.showroom_visit_date)}</span></div>

            <div><strong>Booking Expected Date</strong><span>${fmtDate(lead.booking_expected_date)}</span></div>
            <div><strong>Source</strong><span>${safe(lead.source || "WEBSITE")}</span></div>
            <div><strong>Lead Type</strong><span>${safe(lead.lead_type || lead.action_type || "ENQUIRY")}</span></div>
            <div><strong>Campaign</strong><span>${safe(lead.campaign_name || "-")}</span></div>

            <div><strong>Priority</strong><span>${safe(lead.priority || "-")}</span></div>
            <div><strong>Score</strong><span>${safe(lead.score || 0)}</span></div>
            <div><strong>Status</strong><span>${safe(lead.status || "-")}</span></div>
            <div><strong>Assigned To</strong><span>${safe(lead.assigned_name || "Unassigned")}</span></div>

            <div><strong>Next Follow-up</strong><span>${fmtDate(lead.next_followup_at)}</span></div>
            <div><strong>Last Follow-up</strong><span>${fmtDate(lead.last_followup_at)}</span></div>
            <div><strong>Follow-up Count</strong><span>${lead.followup_count || 0}</span></div>
            <div><strong>Created At</strong><span>${fmtDate(lead.created_at)}</span></div>
        </div>

        <div class="detail-notes">
            <strong>Latest Notes / Follow-up Remarks</strong>
            <p>${safe(lead.notes || lead.followup_notes || "No notes added")}</p>
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
    const rawDateTime = document.getElementById("nextFollowupAt").value;
    const next_followup_at = rawDateTime ? `${rawDateTime}:00+05:30` : "";
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

function loadVehicleModels() {
    const category = document.getElementById("e_vehicle_category").value;
    const fuelSelect = document.getElementById("e_fuel_type");
    const modelSelect = document.getElementById("e_car");
    const variantSelect = document.getElementById("e_variant");

    fuelSelect.innerHTML = `<option value="">Select Fuel Type</option>`;
    modelSelect.innerHTML = `<option value="">Select Model</option>`;
    variantSelect.innerHTML = `<option value="">Select Variant</option>`;

    if (!category || !VEHICLE_DATA[category]) return;

    VEHICLE_DATA[category].fuelTypes.forEach(fuel => {
        fuelSelect.innerHTML += `<option value="${fuel}">${fuel}</option>`;
    });

    Object.keys(VEHICLE_DATA[category].models).forEach(model => {
        modelSelect.innerHTML += `<option value="${model}">${model}</option>`;
    });
}

function loadVehicleVariants() {
    const category = document.getElementById("e_vehicle_category").value;
    const model = document.getElementById("e_car").value;
    const variantSelect = document.getElementById("e_variant");

    variantSelect.innerHTML = `<option value="">Select Variant</option>`;

    if (!category || !model) return;

    const variants = VEHICLE_DATA[category]?.models?.[model] || [];

    variants.forEach(variant => {
        variantSelect.innerHTML += `<option value="${variant}">${variant}</option>`;
    });
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
