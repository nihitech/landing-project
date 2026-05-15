let priorityChart = null;
let actionChart = null;

document.addEventListener("DOMContentLoaded", () => {
  loadDashboard().catch((err) => {
    console.error("Dashboard load error:", err);
    if (typeof toast === "function") toast("Failed to load dashboard", true);
  });

  setInterval(() => {
    loadDashboard().catch(console.error);
  }, 50000);
});

async function loadDashboard() {
  const analytics = await loadAnalyticsSafe();
  const leads = await loadLeadsSafe();

  updateStats(analytics);
  renderCharts(analytics);
  renderFollowupLists(leads);
  renderDashboardNotifications(leads);
}

async function loadAnalyticsSafe() {
  try {
    const res = await request(`${API}/analytics`, {
      headers: authHeaders()
    });

    return res || {};
  } catch (err) {
    console.warn("Analytics API failed, using empty dashboard data:", err);
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

function updateStats(analytics) {
  const ids = [
    "total",
    "hot",
    "warm",
    "cold",
    "booked",
    "closed",
    "today_followups",
    "overdue_followups"
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerText = Number(analytics[id] || 0);
  });
}

function renderCharts(analytics) {
  if (typeof Chart === "undefined") return;

  if (priorityChart) priorityChart.destroy();
  if (actionChart) actionChart.destroy();

  const priorityCanvas = document.getElementById("priorityChart");

  if (priorityCanvas) {
    priorityChart = new Chart(priorityCanvas, {
      type: "doughnut",
      data: {
        labels: ["HOT", "WARM", "COLD"],
        datasets: [
          {
            data: [
              Number(analytics.hot || 0),
              Number(analytics.warm || 0),
              Number(analytics.cold || 0)
            ],
            backgroundColor: ["#ef4444", "#f59e0b", "#3b82f6"]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }

  const actionCanvas = document.getElementById("actionChart");

  if (actionCanvas) {
    actionChart = new Chart(actionCanvas, {
      type: "bar",
      data: {
        labels: ["Enquiry", "Test Drive", "Booked", "Closed"],
        datasets: [
          {
            data: [
              Number(analytics.enquiry || 0),
              Number(analytics.testdrive || 0),
              Number(analytics.booked || 0),
              Number(analytics.closed || 0)
            ],
            backgroundColor: ["#3b82f6", "#06b6d4", "#22c55e", "#111827"]
          }
        ]
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
    return new Date(date) < now && status !== "COMPLETED" && status !== "CLOSED";
  });

  box.innerHTML = items.length
    ? items.slice(0, 8).map(renderFollowupItem).join("")
    : `<p class="empty-text">No missed follow-ups.</p>`;
}

function renderFollowupItem(lead) {
  const name = escapeHtml(lead.name || lead.customer_name || "Customer");
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

function renderDashboardNotifications(leads) {
  const overdueCount = leads.filter((lead) => {
    const date = lead.next_followup_at || lead.next_followup_date || lead.followup_date;
    if (!date) return false;
    return new Date(date) < new Date();
  }).length;

  const countEl = document.getElementById("notificationCount");
  const listEl = document.getElementById("notificationList");

  if (countEl) countEl.innerText = overdueCount;

  if (listEl) {
    listEl.innerHTML = overdueCount
      ? `<p>⚠ ${overdueCount} missed follow-up(s) need attention.</p>`
      : `<p>No urgent notifications.</p>`;
  }
}

function toggleNotifications() {
  const panel = document.getElementById("notificationPanel");
  if (panel) panel.classList.toggle("show");
}

function openLeadDetails(id) {
  if (!id) return;
  window.location.href = `lead-details.html?id=${id}`;
}

function formatDateSafe(value) {
  try {
    return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
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