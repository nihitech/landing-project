/* =====================================================
   NIKRION Technologies CRM Common Layout
   - Shared API helpers
   - Shared auth handling
   - Shared professional nested sidebar
   - Shared small UI helpers
   ===================================================== */

const API = window.CRM_API || "https://landing-backend-8gvq.onrender.com/api";
const API_BASE = API;

const token =
  localStorage.getItem("token") ||
  sessionStorage.getItem("token") ||
  "";

let user = readCurrentUser();
let currentUser = user;

function isHigherAuthority(roleValue = user?.role) {
  return ["admin", "super_admin", "owner", "director", "ceo"].includes(
    String(roleValue || "").trim().toLowerCase()
  );
}


function readCurrentUser() {
  const raw =
    localStorage.getItem("user") ||
    sessionStorage.getItem("user") ||
    localStorage.getItem("crm_user") ||
    sessionStorage.getItem("crm_user") ||
    "{}";

  try {
    const parsed = JSON.parse(raw || "{}");
    parsed.role = String(parsed.role || "sales").toLowerCase();
    return parsed;
  } catch {
    return { role: "sales" };
  }
}

function isLoggedIn() {
  return Boolean(token);
}

function authHeaders(json = false) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
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
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    window.location.href = "login.html";
    return Promise.reject(new Error("Session expired. Please login again."));
  }

  if (!response.ok) {
    const message = data.message || data.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function safe(value, fallback = "-") {
  const text = value === null || value === undefined || value === "" ? fallback : value;
  return String(text).replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function fmtDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safe(value);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function toast(message, isError = false) {
  let box = document.getElementById("toastBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "toastBox";
    box.className = "toast-box";
    document.body.appendChild(box);
  }

  const item = document.createElement("div");
  item.className = `toast ${isError ? "error" : "success"}`;
  item.textContent = message || (isError ? "Something went wrong" : "Done");
  box.appendChild(item);

  setTimeout(() => item.remove(), 3500);
}

function requireAdminPage() {
  if (!isHigherAuthority(user?.role) && !["manager", "branch_manager"].includes(String(user?.role || "").toLowerCase())) {
    toast("You do not have permission to view this page", true);
    setTimeout(() => (window.location.href = "dashboard.html"), 800);
    return false;
  }
  return true;
}

function renderNotificationBell(leads = []) {
  const countEl = document.getElementById("notificationCount");
  const listEl = document.getElementById("notificationList");
  if (!countEl && !listEl) return;

  const now = new Date();
  const missed = (Array.isArray(leads) ? leads : []).filter(lead => {
    const date = lead.next_followup_at || lead.next_followup_date || lead.followup_date;
    const status = String(lead.followup_status || lead.status || "").toUpperCase();
    return date && new Date(date) < now && !["COMPLETED", "CLOSED", "LOST"].includes(status);
  });

  if (countEl) countEl.textContent = missed.length;
  if (listEl) {
    listEl.innerHTML = missed.length
      ? missed.slice(0, 8).map(lead => `
          <div class="notification-item" onclick="openLeadDetailsFromCommon(${Number(lead.id)})">
            <strong>${safe(lead.name || lead.customer_name || "Customer")}</strong>
            <small>${safe(lead.phone || "-")} • ${fmtDate(lead.next_followup_at || lead.next_followup_date || lead.followup_date)}</small>
          </div>
        `).join("")
      : `<div class="empty-state small">No urgent notifications</div>`;
  }
}

function toggleNotifications() {
  const panel = document.getElementById("notificationPanel");
  if (panel) panel.classList.toggle("show");
}

function openLeadDetailsFromCommon(id) {
  if (!id) return;
  if (typeof openLeadDetails === "function") return openLeadDetails(id);
  window.location.href = `leads.html?lead_id=${id}`;
}

function renderTodayFollowups(leads = []) {
  const box = document.getElementById("todayFollowups");
  if (!box) return;
  const today = new Date().toISOString().slice(0, 10);
  const rows = (Array.isArray(leads) ? leads : []).filter(lead => {
    const date = lead.next_followup_at || lead.next_followup_date || lead.followup_date;
    return date && String(date).slice(0, 10) === today;
  });
  box.innerHTML = rows.length ? rows.slice(0, 8).map(renderMiniFollowupCard).join("") : `<div class="empty-state">No follow-ups today</div>`;
}

function renderOverdueFollowups(leads = []) {
  const box = document.getElementById("overdueFollowups");
  if (!box) return;
  const now = new Date();
  const rows = (Array.isArray(leads) ? leads : []).filter(lead => {
    const date = lead.next_followup_at || lead.next_followup_date || lead.followup_date;
    const status = String(lead.followup_status || lead.status || "").toUpperCase();
    return date && new Date(date) < now && !["COMPLETED", "CLOSED", "LOST"].includes(status);
  });
  box.innerHTML = rows.length ? rows.slice(0, 8).map(renderMiniFollowupCard).join("") : `<div class="empty-state">No missed follow-ups</div>`;
}

function renderMiniFollowupCard(lead) {
  return `
    <div class="followup-mini-card" onclick="openLeadDetailsFromCommon(${Number(lead.id)})">
      <strong>${safe(lead.name || lead.customer_name || "Customer")}</strong>
      <span>${safe(lead.phone || "-")}</span>
      <small>${fmtDate(lead.next_followup_at || lead.next_followup_date || lead.followup_date)}</small>
    </div>
  `;
}

const CRM_MENU = [
  {
    title: "Dashboard",
    icon: "🏠",
    key: "dashboard",
    children: [
      { title: "Overview", url: "dashboard.html", key: "dashboard" },
      { title: "Analytics", url: "analytics.html", key: "analytics" },
      { title: "Performance", url: "performance.html", key: "performance" }
    ]
  },
  {
    title: "Lead Management",
    icon: "👥",
    key: "leads",
    children: [
      {
        title: "Lead Operations",
        children: [
          { title: "All Leads", url: "leads.html", key: "leads" },
          { title: "Follow-ups", url: "followups.html", key: "followups" }
        ]
      },
      {
        title: "Customer Pipeline",
        children: [
          { title: "Bookings", url: "bookings.html", key: "bookings" },
          { title: "Delivery / PDI", url: "delivery.html", key: "delivery" }
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
        title: "Inventory Control",
        children: [
          { title: "Stock Summary", url: "stock.html", key: "stock" },
          { title: "VIN Inventory", url: "inventory.html", key: "inventory" }
        ]
      }
    ]
  },
  {
    title: "Organization",
    icon: "🏢",
    key: "masters",
    children: [
      {
        title: "Branch Setup",
        children: [
          { title: "Branches", url: "branches.html", key: "branches" },
          { title: "Departments", url: "departments.html", key: "departments" }
        ]
      },
      {
        title: "Access Control",
        children: [
          { title: "Users", url: "users.html", key: "users" },
          { title: "Roles & Permissions", url: "permissions.html", key: "permissions" }
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
        title: "Management Reports",
        children: [
          { title: "Reports Center", url: "reports.html", key: "reports" },
          { title: "Activity Intelligence", url: "activity.html", key: "activity" },
          { title: "Settings", url: "settings.html", key: "settings" }
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
          <h2>NIKRION</h2>
          <span>Engineering Intelligent Futures</span>
        </div>
      </div>
      <nav class="sidebar-tree">
        ${CRM_MENU.map(group => renderMenuGroup(group, activeKey)).join("")}
      </nav>
    </aside>
  `;

  document.querySelectorAll(".admin-only").forEach(el => {
    const role = String(user?.role || "").toLowerCase();
    if (!isHigherAuthority(role) && !["manager", "branch_manager"].includes(role)) el.style.display = "none";
  });
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
    return `<a class="menu-link level-${level} ${active}" href="${node.url}">${safe(node.title)}</a>`;
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

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
  window.location.href = "login.html";
}

window.API = API;
window.API_BASE = API_BASE;
window.token = token;
window.user = user;
window.currentUser = currentUser;
window.authHeaders = authHeaders;
window.request = request;
window.safe = safe;
window.cleanPhone = cleanPhone;
window.fmtDate = fmtDate;
window.toast = toast;
window.requireAdminPage = requireAdminPage;
window.renderNotificationBell = renderNotificationBell;
window.renderTodayFollowups = renderTodayFollowups;
window.renderOverdueFollowups = renderOverdueFollowups;
window.toggleNotifications = toggleNotifications;
window.loadLayout = loadLayout;
window.logout = logout;
