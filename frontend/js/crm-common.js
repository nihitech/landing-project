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
    title: "Command",
    icon: "⌁",
    key: "command",
    tone: "command",
    children: [
      { title: "Control Center", url: "dashboard.html", key: "dashboard" },
      { title: "Activity Intelligence", url: "activity.html", key: "activity", adminOnly: true },
      { title: "Analytics", url: "analytics.html", key: "analytics" },
      { title: "Performance", url: "performance.html", key: "performance" }
    ]
  },
  {
    title: "Customer Flow",
    icon: "◈",
    key: "customer-flow",
    tone: "customer",
    children: [
      {
        title: "Capture",
        children: [
          { title: "All Leads", url: "leads.html", key: "leads" },
          { title: "Quick Enquiries", url: "quick-enquiries.html", key: "quick-enquiries" },
          { title: "Showroom QR", url: "showroom-qr-admin.html", key: "showroom-qr" },
          { title: "Follow-ups", url: "followups.html", key: "followups" }
        ]
      },
      {
        title: "Conversion",
        children: [
          { title: "Bookings", url: "bookings.html", key: "bookings" },
          { title: "Delivery / PDI", url: "delivery.html", key: "delivery" }
        ]
      }
    ]
  },
  {
    title: "Field Ops",
    icon: "◎",
    key: "field-ops",
    tone: "field",
    children: [
      { title: "Field Activities", url: "field-activities.html", key: "field-activities" }
    ]
  },
  {
    title: "Vehicle Grid",
    icon: "▣",
    key: "vehicle-grid",
    tone: "stock",
    children: [
      {
        title: "Vehicle Master",
        children: [
          { title: "Vehicle Status", url: "vehicle-status.html", key: "vehicle-status" },
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
    icon: "▤",
    key: "organization",
    tone: "org",
    adminOnly: true,
    children: [
      {
        title: "Structure",
        children: [
          { title: "Branches", url: "branches.html", key: "branches", adminOnly: true },
          { title: "Departments", url: "departments.html", key: "departments", adminOnly: true }
        ]
      },
      {
        title: "Access",
        children: [
          { title: "Users", url: "users.html", key: "users", adminOnly: true },
          { title: "Roles & Permissions", url: "permissions.html", key: "permissions", adminOnly: true },
          { title: "Governance Matrix", url: "governance-matrix.html", key: "governance-matrix" }
        ]
      }
    ]
  },
  {
    title: "Reports",
    icon: "◫",
    key: "reports",
    tone: "reports",
    children: [
      { title: "Reports Center", url: "reports.html", key: "reports" },
      { title: "Communications", url: "communications.html", key: "communications" },
      { title: "Data Change Approvals", url: "data-change-approvals.html", key: "data-change-approvals" },
      { title: "Settings", url: "settings.html", key: "settings" }
    ]
  }
];

function loadLayout(activeKey = "") {
  const sidebar = document.getElementById("sidebarContainer");
  if (!sidebar) return;

  const roleLabel = String(user?.role || "user").replace(/_/g, " ").toUpperCase();
  const userLabel = user?.name || user?.email || "Operator";

  sidebar.innerHTML = `
    <aside class="crm-sidebar nikrion-shell">
      <div class="sidebar-brand nikrion-brand-panel">
        <div class="brand-logo nikrion-mark">N</div>
        <div>
          <h2>NIKRION</h2>
          <span>Operational Intelligence</span>
        </div>
      </div>

      <div class="operator-chip">
        <span>${safe(userLabel)}</span>
        <small>${safe(roleLabel)}</small>
      </div>

      <nav class="sidebar-tree nikrion-tree">
        ${CRM_MENU.map(group => renderMenuGroup(group, activeKey)).join("")}
      </nav>

      <div class="sidebar-signature">
        <strong>DealerOS Core</strong>
        <span>Engineering Intelligent Futures</span>
      </div>
    </aside>
  `;

  document.querySelectorAll("[data-admin-only='true'], .admin-only").forEach(el => {
    const role = String(user?.role || "").toLowerCase();
    if (!isHigherAuthority(role) && !["manager", "branch_manager"].includes(role)) {
      el.style.display = "none";
    }
  });

  document.body.classList.add("nikrion-ops-ui");
  applyGovernanceUiRules();
}

function renderMenuGroup(group, activeKey) {
  const isOpen = isGroupActive(group, activeKey);
  const adminAttr = group.adminOnly ? `data-admin-only="true"` : "";
  return `
    <div class="menu-group ${isOpen ? "open" : ""} tone-${group.tone || "default"}" ${adminAttr}>
      <button class="menu-main" type="button" onclick="toggleMenuGroup(this)">
        <span class="menu-symbol">${group.icon || "•"}</span>
        <span class="menu-title-text">${safe(group.title)}</span>
        <b>⌄</b>
      </button>
      <div class="menu-children">
        ${(group.children || []).map(child => renderMenuNode(child, activeKey, 1)).join("")}
      </div>
    </div>
  `;
}

function renderMenuNode(node, activeKey, level = 1) {
  const adminAttr = node.adminOnly ? `data-admin-only="true"` : "";

  if (node.url) {
    const active = node.key === activeKey ? "active" : "";
    return `<a class="menu-link level-${level} ${active}" href="${node.url}" ${adminAttr}>
      <span>${safe(node.title)}</span>
    </a>`;
  }

  const isOpen = isGroupActive(node, activeKey);
  return `
    <div class="menu-node ${isOpen ? "open" : ""}" ${adminAttr}>
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


async function applyGovernanceUiRules() {
  try {
    if (!window.API || !window.token) return;
    const res = await fetch(`${API}/governance/me`, { headers: authHeaders() });
    if (!res.ok) return;
    const gov = await res.json();

    // Sales users should not see full vehicle master/dashboard controls.
    if (!gov.can_modify_vehicle_master) {
      document.querySelectorAll('a[href="vehicles.html"], a[data-nav="vehicles"]').forEach(el => {
        el.style.display = "none";
      });
    }

    if (!gov.can_modify_organization) {
      document.querySelectorAll('a[href="branches.html"], a[href="departments.html"], a[href="permissions.html"]').forEach(el => {
        if (String(user?.role || "").toLowerCase() !== "admin") el.style.display = "none";
      });
    }

    if (!gov.can_generate_reports) {
      document.querySelectorAll('a[href="reports.html"]').forEach(el => {
        if (String(user?.role || "").toLowerCase() !== "admin") el.style.display = "none";
      });
    }
  } catch (err) {
    console.warn("Governance UI rules failed:", err.message);
  }
}
