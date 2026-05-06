const API = window.CRM_API || "https://landing-backend-8gvq.onrender.com/api";
const token = sessionStorage.getItem("token");
const user = JSON.parse(sessionStorage.getItem("user") || "{}");

if (!token) window.location.href = "login.html";

function authHeaders() {
    return { Authorization: `Bearer ${token}` };
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

async function loadDashboard() {
    try {
        const analytics = await request(`${API}/analytics`, {
            headers: authHeaders()
        });

        [
            "total",
            "hot",
            "warm",
            "cold",
            "enquiry",
            "testdrive",
            "booked",
            "closed",
            "today_followups",
            "overdue_followups"
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = Number(analytics[id] || 0);
        });

        const leads = await request(`${API}/leads`, {
            headers: authHeaders()
        });

        renderTodayFollowups(leads);
        renderNotifications(leads);

    } catch (error) {
        console.error("Dashboard load error:", error);
    }
}

function renderTodayFollowups(leads) {
    const box = document.getElementById("todayFollowups");
    if (!box) return;

    const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata"
    });

    const due = leads.filter(lead => {
        if (!lead.next_followup_at) return false;

        const leadDate = new Date(lead.next_followup_at).toLocaleDateString("en-CA", {
            timeZone: "Asia/Kolkata"
        });

        return leadDate === today && !["CLOSED", "LOST"].includes(lead.status);
    });

    box.innerHTML = due.length
        ? due.map(lead => `
            <div class="followup-card">
                <strong>${safe(lead.name)}</strong>
                <span>${safe(lead.phone)} • ${safe(lead.car_interest || "Not Selected")}</span>
                <small>${fmtDate(lead.next_followup_at)}</small>
            </div>
        `).join("")
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
        ? overdue.map(lead => `
            <div class="notification-item overdue">
                ⚠ ${safe(lead.name)} follow-up missed — ${fmtDate(lead.next_followup_at)}
            </div>
        `).join("")
        : `<div class="empty-state">No notifications</div>`;
}

window.onload = loadDashboard;
setInterval(loadDashboard, 50000);