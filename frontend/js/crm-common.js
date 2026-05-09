
const API = "https://landing-backend-8gvq.onrender.com/api";
const token = sessionStorage.getItem("token");
const user = JSON.parse(sessionStorage.getItem("user") || "{}");
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
    AD: {
        label: "Diesel / Petrol Vehicle",
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
        label: "Electric Vehicle",
        fuelTypes: ["ELECTRIC"],
        models: {
            "XUV400 EV": ["EC", "EL"],
            "BE 6": ["Pack One", "Pack One Above", "Pack Two", "Pack Three"],
            "XEV 9e": ["Pack One", "Pack Two", "Pack Three"]
        }
    }
};

if (!token && !location.pathname.endsWith("login.html") && !location.pathname.endsWith("index.html")) {
    location.href = "login.html";
}

function authHeaders(json = false) {
    const h = { Authorization: `Bearer ${token}` };
    if (json) h["Content-Type"] = "application/json";
    return h;
}

async function request(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
        sessionStorage.clear();
        location.href = "login.html";
        return null;
    }
    if (!res.ok) throw new Error(data.message || "Request failed");
    return data;
}

function safe(v) {
    return String(v ?? "-").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
function cleanPhone(phone) { return String(phone || "").replace(/\D/g, "").slice(-10); }
function toISTInput(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false
    }).formatToParts(d);
    const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`;
}
function dateKeyIST(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Kolkata", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(d);
    const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${m.year}-${m.month}-${m.day}`;
}
function fmtDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("en-IN", { timeZone:"Asia/Kolkata", day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true });
}
function toast(message, error = false) {
    let el = document.getElementById("crmToast");
    if (!el) { el = document.createElement("div"); el.id = "crmToast"; document.body.appendChild(el); }
    el.textContent = message;
    el.className = `crm-toast show ${error ? "error" : ""}`;
    setTimeout(() => { el.className = "crm-toast"; }, 2500);
}
function logout() { sessionStorage.clear(); location.href = "login.html"; }
function requireAdminPage() { if (user.role !== "admin") location.href = "user-dashboard.html"; }

async function loadLayout(active = "") {
    const box = document.getElementById("sidebarContainer");
    if (!box) return;
    const html = await fetch("./components/sidebar.html").then(r => r.text());
    box.innerHTML = html;
    const u = document.getElementById("sidebarUser");
    if (u) u.textContent = `${user.name || "User"} (${user.role || "sales"})`;
    document.querySelectorAll("[data-admin-only='true']").forEach(a => { if (user.role !== "admin") a.style.display = "none"; });
    if (active) {
        const link = document.querySelector(`[data-nav="${active}"]`);
        if (link) link.classList.add("active");
    }
}

function renderNotificationBell(leads) {
    const count = document.getElementById("notificationCount");
    const list = document.getElementById("notificationList");
    if (!count || !list) return;
    const now = new Date();
    const notes = [];
    leads.forEach(l => {
        if (user.role === "admin" && !l.assigned_to) notes.push({type:"new", text:`🆕 Unassigned lead: ${safe(l.name)}`});
        if (l.next_followup_at && !["CLOSED","LOST"].includes(l.status)) {
            const d = new Date(l.next_followup_at);
            if (d < now) notes.push({type:"overdue", text:`⚠ Missed follow-up: ${safe(l.name)} (${fmtDate(l.next_followup_at)})`});
            else if (dateKeyIST(l.next_followup_at) === dateKeyIST(new Date())) notes.push({type:"today", text:`📞 Follow-up today: ${safe(l.name)} (${fmtDate(l.next_followup_at)})`});
        }
    });
    count.textContent = notes.length;
    list.innerHTML = notes.length ? notes.map(n => `<div class="notification-item ${n.type}">${n.text}</div>`).join("") : `<div class="empty-state">No notifications</div>`;
}
function toggleNotifications() {
    const p = document.getElementById("notificationPanel");
    if (p) p.classList.toggle("show");
}

function renderTodayFollowups(leads, targetId = "todayFollowups") {
    const box = document.getElementById(targetId); if (!box) return;
    const today = dateKeyIST(new Date());
    const due = leads.filter(l => l.next_followup_at && dateKeyIST(l.next_followup_at) === today && !["CLOSED","LOST"].includes(l.status));
    box.innerHTML = due.length ? due.map(l => `<div class="followup-card"><strong>${safe(l.name)}</strong><span>${safe(l.phone)} • ${safe(l.car_interest || "Not Selected")}</span><small>${fmtDate(l.next_followup_at)} • ${safe(l.assigned_name || "Unassigned")}</small><div class="card-actions"><a href="tel:${cleanPhone(l.phone)}">📞 Call</a><button onclick="openFollowup(${l.id})">Follow-up</button></div></div>`).join("") : `<div class="empty-state">No follow-ups today</div>`;
}
function renderOverdueFollowups(leads, targetId = "overdueFollowups") {
    const box = document.getElementById(targetId); if (!box) return;
    const now = new Date();
    const overdue = leads.filter(l => l.next_followup_at && new Date(l.next_followup_at) < now && !["CLOSED","LOST"].includes(l.status));
    box.innerHTML = overdue.length ? overdue.map(l => {
        const hours = Math.max(0, Math.floor((now - new Date(l.next_followup_at))/(1000*60*60)));
        return `<div class="overdue-card"><div class="overdue-top"><strong>${safe(l.name)}</strong><span>${hours} hrs overdue</span></div><p>${safe(l.phone)}</p><small>${safe(l.car_interest || "Not Selected")}</small><small>Due: ${fmtDate(l.next_followup_at)}</small><div class="overdue-actions"><a href="tel:${cleanPhone(l.phone)}">📞 Call</a><a href="https://wa.me/91${cleanPhone(l.phone)}" target="_blank">💬 WhatsApp</a><button onclick="openFollowup(${l.id})">Reschedule</button></div></div>`;
    }).join("") : `<div class="empty-state">✅ No missed follow-ups</div>`;
}

function loadVehicleModels() {
    const cat = document.getElementById("e_vehicle_category")?.value || "";
    const fuel = document.getElementById("e_fuel_type");
    const model = document.getElementById("e_car");
    const variant = document.getElementById("e_variant");
    if (!fuel || !model || !variant) return;
    fuel.innerHTML = `<option value="">Select Fuel Type</option>`;
    model.innerHTML = `<option value="">Select Model</option>`;
    variant.innerHTML = `<option value="">Select Variant</option>`;
    if (!cat || !VEHICLE_DATA[cat]) return;
    VEHICLE_DATA[cat].fuelTypes.forEach(f => fuel.innerHTML += `<option value="${f}">${f}</option>`);
    Object.keys(VEHICLE_DATA[cat].models).forEach(m => model.innerHTML += `<option value="${m}">${m}</option>`);
}
function loadVehicleVariants() {
    const cat = document.getElementById("e_vehicle_category")?.value || "";
    const model = document.getElementById("e_car")?.value || "";
    const variant = document.getElementById("e_variant");
    if (!variant) return;
    variant.innerHTML = `<option value="">Select Variant</option>`;
    (VEHICLE_DATA[cat]?.models?.[model] || []).forEach(v => variant.innerHTML += `<option value="${v}">${v}</option>`);
}

function openFollowup(id) {
    const leadId = document.getElementById("followupLeadId");
    if (!leadId) return toast("Follow-up form missing", true);
    leadId.value = id;
    document.getElementById("callStatus").value = "CONNECTED";
    document.getElementById("customerResponse").value = "INTERESTED";
    document.getElementById("nextFollowupAt").value = "";
    document.getElementById("followupRemarks").value = "";
    document.getElementById("followupModal").classList.add("show");
}
function closeFollowupModal() { document.getElementById("followupModal")?.classList.remove("show"); }
async function submitFollowup() {
    const id = document.getElementById("followupLeadId").value;
    const raw = document.getElementById("nextFollowupAt").value;
    const next_followup_at = raw ? `${raw}:00+05:30` : "";
    if (!next_followup_at) return toast("Please select next follow-up date", true);
    try {
        await request(`${API}/lead/${id}/followup`, { method:"POST", headers:authHeaders(true), body:JSON.stringify({ call_status:document.getElementById("callStatus").value, customer_response:document.getElementById("customerResponse").value, next_followup_at, remarks:document.getElementById("followupRemarks").value }) });
        toast("Follow-up saved"); closeFollowupModal();
        if (typeof loadPage === "function") await loadPage();
    } catch(e) { toast(e.message, true); }
}

function followupModalHTML() {
    return `<div id="followupModal" class="followup-modal"><div class="followup-modal-card"><h2>📞 Add Follow-up</h2><input type="hidden" id="followupLeadId"><label>Call Status</label><select id="callStatus"><option value="CONNECTED">Connected</option><option value="NOT_CONNECTED">Not Connected</option><option value="BUSY">Busy</option><option value="SWITCHED_OFF">Switched Off</option><option value="WRONG_NUMBER">Wrong Number</option></select><label>Customer Response</label><select id="customerResponse"><option value="INTERESTED">Interested</option><option value="NEED_TIME">Need Time</option><option value="TEST_DRIVE">Test Drive</option><option value="SHOWROOM_VISIT">Showroom Visit</option><option value="BOOKING_EXPECTED">Booking Expected</option><option value="NOT_INTERESTED">Not Interested</option></select><label>Next Follow-up Date & Time</label><input type="datetime-local" id="nextFollowupAt"><label>Remarks</label><textarea id="followupRemarks" placeholder="Customer discussion details..."></textarea><div class="followup-modal-actions"><button onclick="closeFollowupModal()" class="cancel-btn">Cancel</button><button onclick="submitFollowup()" class="save-btn">Save Follow-up</button></div></div></div>`;
}
