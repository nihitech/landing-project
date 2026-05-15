/* =====================================================
   NihiKra / Nihi Tech CRM Common Layout + Utilities
   Safe frontend-only layer. Backend routes are untouched.
===================================================== */

const API = window.CRM_API || "https://landing-backend-8gvq.onrender.com/api";
const token = sessionStorage.getItem("token") || localStorage.getItem("token") || "";
const user = JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("user") || "{}");

if (!token && !["login.html", "index.html", ""].includes(location.pathname.split("/").pop())) {
  window.location.href = "login.html";
}

const CRM_MENU = [
  {
    title: "Dashboard",
    icon: "🏠",
    key: "dashboard",
    children: [
      { title: "Overview", url: "dashboard.html", key: "dashboard" }
    ]
  },
  {
    title: "Lead Management",
    icon: "👥",
    key: "leads",
    children: [
      {
        title: "Leads",
        children: [
          { title: "All Leads", url: "leads.html", key: "leads" },
          { title: "Follow-ups", url: "followups.html", key: "followups" }
        ]
      },
      {
        title: "Customer Pipeline",
        children: [
          { title: "Referrals", url: "referrals.html", key: "referrals" },
          { title: "Field Activity", url: "field-activity.html", key: "field-activity" }
        ]
      }
    ]
  },
  {
    title: "Vehicle & Stock",
    icon: "🚗",
    key: "vehicle",
    children: [
      {
        title: "Vehicle Master",
        children: [
          { title: "Models / Variants", url: "vehicles.html", key: "vehicles" }
        ]
      },
      {
        title: "Inventory",
        children: [
          { title: "Stock Summary", url: "stock.html", key: "stock" },
          { title: "VIN Inventory", url: "inventory.html", key: "inventory" }
        ]
      }
    ]
  },
  {
    title: "Booking & Delivery",
    icon: "📦",
    key: "booking",
    children: [
      {
        title: "Retail",
        children: [
          { title: "Bookings", url: "bookings.html", key: "bookings" }
        ]
      },
      {
        title: "Delivery",
        children: [
          { title: "Delivery / PDI", url: "delivery.html", key: "delivery" }
        ]
      }
    ]
  },
  {
    title: "Masters",
    icon: "⚙️",
    key: "masters",
    children: [
      {
        title: "Organization",
        children: [
          { title: "Branches", url: "branches.html", key: "branches" },
          { title: "Departments", url: "departments.html", key: "departments" }
        ]
      },
      {
        title: "Access Control",
        children: [
          { title: "Users", url: "users.html", key: "users" },
          { title: "Roles & Permissions", url: "permissions.html", key: "permissions" },
          { title: "Settings", url: "settings.html", key: "settings" }
        ]
      }
    ]
  },
  {
    title: "Reports",
    icon: "📊",
    key: "reports",
    children: [
      {
        title: "Business Reports",
        children: [
          { title: "Analytics", url: "analytics.html", key: "analytics" },
          { title: "Reports", url: "reports.html", key: "reports" },
          { title: "Performance", url: "performance.html", key: "performance" }
        ]
      }
    ]
  }
];

function loadLayout(activeKey = "") {
  const sidebar = document.getElementById("sidebarContainer");
  if (!sidebar) return;

  sidebar.innerHTML = `
    <aside class="crm-sidebar">
      <div class="sidebar-brand">
        <div class="brand-logo">N</div>
        <div>
          <h2>Nihikra</h2>
          <span>Automobile CRM</span>
        </div>
      </div>

      <nav class="sidebar-tree">
        ${CRM_MENU.map(group => renderMenuGroup(group, activeKey)).join("")}
      </nav>
    </aside>
  `;
}

function renderMenuGroup(group, activeKey) {
  const isOpen = isGroupActive(group, activeKey);

  return `
    <div class="menu-group ${isOpen ? "open" : ""}">
      <button class="menu-main" type="button" onclick="toggleMenuGroup(this)">
        <span>${group.icon || "•"} ${safe(group.title)}</span>
        <b>⌄</b>
      </button>

      <div class="menu-children">
        ${(group.children || []).map(child => renderMenuNode(child, activeKey, 1)).join("")}
      </div>
    </div>
  `;
}

function renderMenuNode(node, activeKey, level = 1) {
  if (node.url) {
    const active = node.key === activeKey ? "active" : "";

    return `
      <a class="menu-link level-${level} ${active}" href="${node.url}">
        ${safe(node.title)}
      </a>
    `;
  }

  const isOpen = isGroupActive(node, activeKey);

  return `
    <div class="menu-node ${isOpen ? "open" : ""}">
      <button class="menu-sub" type="button" onclick="toggleMenuNode(this)">
        <span>${safe(node.title)}</span>
        <b>⌄</b>
      </button>

      <div class="menu-node-children">
        ${(node.children || []).map(child => renderMenuNode(child, activeKey, level + 1)).join("")}
      </div>
    </div>
  `;
}

function isGroupActive(node, activeKey) {
  if (!node) return false;
  if (node.key === activeKey) return true;

  return (node.children || []).some(child => isGroupActive(child, activeKey));
}

function toggleMenuGroup(btn) {
  const group = btn.closest(".menu-group");
  if (group) group.classList.toggle("open");
}

function toggleMenuNode(btn) {
  const node = btn.closest(".menu-node");
  if (node) node.classList.toggle("open");
}

function authHeaders(json = false) {
  const headers = { Authorization: `Bearer ${token}` };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
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
    logout();
    return;
  }

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

function logout() {
  sessionStorage.clear();
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "login.html";
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

  setTimeout(() => {
    el.className = "crm-toast";
  }, 2600);
}

function requireAdminPage() {
  const role = String(user?.role || "").toLowerCase();

  if (role !== "admin") {
    toast("Admin access required", true);
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 800);
    return false;
  }

  return true;
}

function getLeadFollowupDate(lead) {
  return lead?.next_followup_at || lead?.next_followup_date || lead?.followup_date || null;
}

function getLeadName(lead) {
  return lead?.name || lead?.customer_name || "Customer";
}

function renderTodayFollowups(leads = []) {
  const box = document.getElementById("todayFollowups");
  if (!box) return;

  const today = dateKeyIST(new Date());
  const due = leads.filter(lead => dateKeyIST(getLeadFollowupDate(lead)) === today);

  if (!due.length) {
    box.innerHTML = `<div class="empty-state">No follow-ups scheduled for today</div>`;
    return;
  }

  box.innerHTML = due.slice(0, 10).map(lead => `
    <div class="followup-card" onclick="window.location.href='lead-details.html?id=${lead.id}'">
      <strong>${safe(getLeadName(lead))}</strong>
      <span>${safe(lead.phone)} • ${safe(lead.car_interest || lead.model_name || "Not Selected")}</span>
      <small>${fmtDate(getLeadFollowupDate(lead))}</small>
    </div>
  `).join("");
}

function renderOverdueFollowups(leads = []) {
  const box = document.getElementById("overdueFollowups");
  if (!box) return;

  const now = new Date();

  const overdue = leads.filter(lead => {
    const followupDate = getLeadFollowupDate(lead);
    if (!followupDate) return false;

    const next = new Date(followupDate);
    const status = String(lead.status || lead.followup_status || "").toUpperCase();

    return next < now && !["CLOSED", "LOST", "COMPLETED"].includes(status);
  });

  if (!overdue.length) {
    box.innerHTML = `<div class="empty-state">✅ No missed follow-ups</div>`;
    return;
  }

  box.innerHTML = overdue.slice(0, 10).map(lead => {
    const phone = cleanPhone(lead.phone);
    const diffMs = now - new Date(getLeadFollowupDate(lead));
    const hours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));

    return `
      <div class="overdue-card">
        <div class="overdue-top">
          <strong>${safe(getLeadName(lead))}</strong>
          <span>${hours} hrs overdue</span>
        </div>
        <p>${safe(lead.phone)}</p>
        <small>${safe(lead.car_interest || lead.model_name || "Not Selected")}</small>
        <small>Follow-up was due: ${fmtDate(getLeadFollowupDate(lead))}</small>
        <div class="overdue-actions">
          <a href="tel:${phone}">📞 Call</a>
          <a href="https://wa.me/91${phone}" target="_blank">💬 WhatsApp</a>
          ${typeof openFollowup === "function" ? `<button onclick="openFollowup(${lead.id})">Reschedule</button>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function renderNotificationBell(leads = []) {
  const countEl = document.getElementById("notificationCount");
  const listEl = document.getElementById("notificationList");

  const now = new Date();
  const overdue = leads.filter(lead => {
    const followupDate = getLeadFollowupDate(lead);
    if (!followupDate) return false;

    const status = String(lead.status || lead.followup_status || "").toUpperCase();
    return new Date(followupDate) < now && !["CLOSED", "LOST", "COMPLETED"].includes(status);
  });

  if (countEl) countEl.innerText = overdue.length;

  if (listEl) {
    listEl.innerHTML = overdue.length
      ? overdue.slice(0, 8).map(lead => `
          <div class="notification-item">
            <strong>${safe(getLeadName(lead))}</strong>
            <span>${fmtDate(getLeadFollowupDate(lead))}</span>
          </div>
        `).join("")
      : `<div class="empty-state">No urgent notifications</div>`;
  }
}

function toggleNotifications() {
  const panel = document.getElementById("notificationPanel");
  if (panel) panel.classList.toggle("show");
}

// Expose important helpers for inline onclick handlers.
window.loadLayout = loadLayout;
window.toggleMenuGroup = toggleMenuGroup;
window.toggleMenuNode = toggleMenuNode;
window.toggleNotifications = toggleNotifications;
window.logout = logout;
window.authHeaders = authHeaders;
window.request = request;
window.toast = toast;
window.safe = safe;
window.fmtDate = fmtDate;
window.dateKeyIST = dateKeyIST;
window.cleanPhone = cleanPhone;
window.requireAdminPage = requireAdminPage;
window.renderTodayFollowups = renderTodayFollowups;
window.renderOverdueFollowups = renderOverdueFollowups;
window.renderNotificationBell = renderNotificationBell;
