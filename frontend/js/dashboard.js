const API = window.CRM_API || "https://landing-backend-8gvq.onrender.com/api";
const token = sessionStorage.getItem("token");
const user = JSON.parse(sessionStorage.getItem("user") || "{}");

if (!token) window.location.href = "login.html";

function authHeaders() {
    return { Authorization: `Bearer ${token}` };
}

async function request(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
        sessionStorage.clear();
        window.location.href = "login.html";
        return;
    }

    if (!response.ok) {
        throw new Error(data.message || "Request failed");
    }

    return data;
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

async function loadDashboard() {
    const analytics = await request(`${API}/analytics`, {
        headers: authHeaders()
    });

    ["total", "hot", "warm", "cold"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = analytics[id] || 0;
    });

    const leads = await request(`${API}/leads`, {
        headers: authHeaders()
    });

    renderTodayFollowups(leads);
    renderNotifications(leads);
}

function renderTodayFollowups(leads) {
    const box = document.getElementById("todayFollowups");
    if (!box) return;

    const today = new Date().toISOString().slice(0, 10);

    const due = leads.filter(lead =>
        lead.next_followup_at &&
        String(lead.next_followup_at).startsWith(today)
    );

    box.innerHTML = due.length
        ? due.map(lead => `<div class="followup-card">${safe(lead.name)} - ${safe(lead.phone)}</div>`).join("")
        : `<div class="empty-state">No follow-ups today</div>`;
}

function renderNotifications(leads) {
    const box = document.getElementById("notificationList");
    if (!box) return;

    const now = new Date();

    const overdue = leads.filter(lead =>
        lead.next_followup_at &&
        new Date(lead.next_followup_at) < now &&
        !["CLOSED", "LOST"].includes(lead.status)
    );

    box.innerHTML = overdue.length
        ? overdue.map(lead => `<div class="notification-item overdue">⚠ ${safe(lead.name)} follow-up missed</div>`).join("")
        : `<div class="empty-state">No notifications</div>`;
}

window.onload = () => {
    loadDashboard().catch(console.error);
};