let priorityChart = null;
let statusChart = null;

document.addEventListener("DOMContentLoaded", () => {
  loadDashboard().catch((err) => {
    console.error("Dashboard load error:", err);
    if (typeof toast === "function") toast("Failed to load dashboard", true);
  });

  setInterval(() => {
    loadDashboard().catch(console.error);
  }, 60000);
});

async function loadDashboard() {
  const summary = await loadDashboardSummarySafe();
  const leads = await loadLeadsSafe();

  updateStats(summary);
  updateAlerts(summary.alerts || {});
  renderCharts(summary);
  renderFollowupLists(leads);
  renderDashboardNotifications(summary.alerts || {}, leads);
  renderRecentActivities(summary.recent_activities || []);
  renderTopUsers(summary.top_users || []);
}

async function loadDashboardSummarySafe() {
  try {
    const res = await request(`${API}/dashboard/summary`, {
      headers: authHeaders()
    });

    return res || {};
  } catch (err) {
    console.warn("Dashboard summary API failed:", err);
    return {};
  }
}

async function loadLeadsSafe() {
  try {
    const res = await request(`${API}/leads`, {
      headers: authHeaders()
    });

    if (Array.isArray(res)) return res;
    if (Array.isArray(res.leads)) return res.leads;
    if (Array.isArray(res.data)) return res.data;

    return [];
  } catch (err) {
    console.warn("Leads API failed, using empty leads list:", err);
    return [];
  }
}

function updateStats(data) {
  const ids = [
    "total",
    "today",
    "hot",
    "warm",
    "cold",
    "bookings",
    "retail",
    "deliveries",
    "today_followups",
    "overdue_followups",
    "available_stock",
    "aged_stock"
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerText = Number(data[id] || 0);
  });
}

function updateAlerts(alerts) {
  const map = {
    alertMissedFollowups: "missed_followups",
    alertBlockedDeliveries: "blocked_deliveries",
    alertAgedStock: "aged_stock",
    alertPendingDelivery: "pending_delivery"
  };

  Object.entries(map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.innerText = Number(alerts[key] || 0);
  });
}

function renderCharts(data) {
  if (typeof Chart === "undefined") return;

  if (priorityChart) priorityChart.destroy();
  if (statusChart) statusChart.destroy();

  const priorityCanvas = document.getElementById("priorityChart");

  if (priorityCanvas) {
    priorityChart = new Chart(priorityCanvas, {
      type: "doughnut",
      data: {
        labels: ["HOT", "WARM", "COLD"],
        datasets: [{
          data: [
            Number(data.hot || 0),
            Number(data.warm || 0),
            Number(data.cold || 0)
          ],
          backgroundColor: ["#ef4444", "#f59e0b", "#3b82f6"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }

  const statusCanvas = document.getElementById("statusChart");
  const statusRows = Array.isArray(data.lead_status) ? data.lead_status : [];

  if (statusCanvas) {
    statusChart = new Chart(statusCanvas, {
      type: "bar",
      data: {
        labels: statusRows.length ? statusRows.map(row => row.status) : ["NEW", "BOOKED", "CLOSED"],
        datasets: [{
          data: statusRows.length ? statusRows.map(row => Number(row.count || 0)) : [0, 0, 0],
          backgroundColor: ["#3b82f6", "#06b6d4", "#f59e0b", "#22c55e", "#ef4444", "#111827", "#8b5cf6"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        }
      }
    });
  }
}

function renderFollowupLists(leads) {
  renderTodayFollowupsSafe(leads);
  renderOverdueFollowupsSafe(leads);
}

function renderTodayFollowupsSafe(leads) {
  const box = document.getElementById("todayFollowups");
  if (!box) return;

  const today = new Date().toISOString().slice(0, 10);

  const items = leads.filter((lead) => {
    const date = lead.next_followup_at || lead.next_followup_date || lead.followup_date;
    return date && String(date).slice(0, 10) === today;
  });

  box.innerHTML = items.length
    ? items.slice(0, 8).map(renderFollowupItem).join("")
    : `<p class="empty-text">No follow-ups for today.</p>`;
}

function renderOverdueFollowupsSafe(leads) {
  const box = document.getElementById("overdueFollowups");
  if (!box) return;

  const now = new Date();

  const items = leads.filter((lead) => {
    const date = lead.next_followup_at || lead.next_followup_date || lead.followup_date;
    if (!date) return false;

    const status = String(lead.followup_status || lead.status || "").toUpperCase();
    return new Date(date) < now && !["COMPLETED", "CLOSED", "LOST"].includes(status);
  });

  box.innerHTML = items.length
    ? items.slice(0, 8).map(renderFollowupItem).join("")
    : `<p class="empty-text">No missed follow-ups.</p>`;
}

function renderFollowupItem(lead) {
  const name = escapeHtml(lead.customer_name || lead.name || "Customer");
  const phone = escapeHtml(lead.phone || lead.mobile || "-");
  const date = lead.next_followup_at || lead.next_followup_date || lead.followup_date || "";

  return `
    <div class="followup-mini-card" onclick="openLeadDetails(${lead.id})">
      <strong>${name}</strong>
      <span>${phone}</span>
      <small>${date ? formatDateSafe(date) : "No date"}</small>
    </div>
  `;
}

function renderDashboardNotifications(alerts, leads) {
  const alertTotal =
    Number(alerts.missed_followups || 0) +
    Number(alerts.blocked_deliveries || 0) +
    Number(alerts.aged_stock || 0) +
    Number(alerts.pending_delivery || 0);

  const countEl = document.getElementById("notificationCount");
  const listEl = document.getElementById("notificationList");

  if (countEl) countEl.innerText = alertTotal;

  if (listEl) {
    listEl.innerHTML = alertTotal
      ? `
        <p>⚠ ${Number(alerts.missed_followups || 0)} missed follow-up(s)</p>
        <p>🚧 ${Number(alerts.blocked_deliveries || 0)} blocked delivery item(s)</p>
        <p>📦 ${Number(alerts.aged_stock || 0)} aged stock risk(s)</p>
        <p>✅ ${Number(alerts.pending_delivery || 0)} retail pending delivery</p>
      `
      : `<p>No urgent notifications.</p>`;
  }
}

function renderRecentActivities(rows) {
  const box = document.getElementById("recentActivityList");
  if (!box) return;

  if (!rows.length) {
    box.innerHTML = `<div class="empty-state">No recent activity found</div>`;
    return;
  }

  box.innerHTML = rows.map(row => `
    <div class="mini-analytics-item activity-mini-item">
      <div>
        <strong>${escapeHtml(row.action || "-")}</strong>
        <small>${escapeHtml(row.module_name || "GENERAL")} • ${escapeHtml(row.user_name || "System")}</small>
        <small>${escapeHtml(row.remarks || "")}</small>
      </div>
      <span>${escapeHtml(row.severity || "INFO")}</span>
    </div>
  `).join("");
}

function renderTopUsers(rows) {
  const box = document.getElementById("topUsersList");
  if (!box) return;

  if (!rows.length) {
    box.innerHTML = `<div class="empty-state">No user activity found</div>`;
    return;
  }

  box.innerHTML = rows.map(row => `
    <div class="mini-analytics-item">
      <div>
        <strong>${escapeHtml(row.user_name || "System")}</strong>
        <small>${escapeHtml(row.role || "-")}</small>
      </div>
      <span>${Number(row.activity_count || 0)}</span>
    </div>
  `).join("");
}

function toggleNotifications() {
  const panel = document.getElementById("notificationPanel");
  if (panel) panel.classList.toggle("show");
}

function openLeadDetails(id) {
  if (!id) return;
  window.location.href = `leads.html?lead=${id}`;
}

function formatDateSafe(value) {
  try {
    return new Date(value).toLocaleString("en-IN");
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.loadDashboard = loadDashboard;
window.toggleNotifications = toggleNotifications;
