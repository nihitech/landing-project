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
    parsed.role = normalizeUserRole(parsed.role || "sales");
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
    title: "Workspaces",
    icon: "▰",
    key: "workspaces",
    tone: "workspace",
    children: [
      { title: "My Workspace", url: "workspace.html", key: "workspace" },
      { title: "Sales Workspace", url: "sales-dashboard.html", key: "sales-dashboard" },
      { title: "Reception Workspace", url: "receptionist-dashboard.html", key: "receptionist-dashboard" },
      { title: "Manager Workspace", url: "manager-dashboard.html", key: "manager-dashboard" },
      { title: "Field Workspace", url: "field-dashboard.html", key: "field-dashboard" },
      { title: "Executive Workspace", url: "executive-dashboard.html", key: "executive-dashboard", adminOnly: true }
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
          { title: "Booking Allocation", url: "booking-allocation.html", key: "booking-allocation" },
          { title: "Delivery / PDI", url: "delivery.html", key: "delivery" },
          { title: "Delivery Readiness", url: "delivery-readiness.html", key: "delivery-readiness" }
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
      { title: "Notifications", url: "notifications.html", key: "notifications" },
      { title: "Customer Timeline", url: "customer-timeline.html", key: "customer-timeline" },
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
        ${CRM_MENU.filter(menuAllowedForRole).map(group => renderMenuGroup(group, activeKey)).join("")}
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
        ${(group.children || []).filter(menuAllowedForRole).map(child => renderMenuNode(child, activeKey, 1)).join("")}
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
        ${(node.children || []).filter(menuAllowedForRole).map(child => renderMenuNode(child, activeKey, level + 1)).join("")}
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


function workspaceForRole(roleValue = user?.role) {
  const role = String(roleValue || "sales").toLowerCase();

  if (["receptionist", "front_office", "cre", "customer_relation_executive"].includes(role)) return "workspace.html";
  if (["manager", "sales_manager", "team_leader", "branch_manager", "bm"].includes(role)) return "workspace.html";
  if (["field", "field_executive"].includes(role)) return "field-dashboard.html";
  if (["gm", "dgm", "md", "ceo", "director", "owner"].includes(role)) return "workspace.html";
  if (["admin", "super_admin", "system_admin"].includes(role)) return "dashboard.html";

  return "workspace.html";
}

function goToMyWorkspace() {
  window.location.href = workspaceForRole(user?.role);
}

function maybeRedirectDashboardToWorkspace() {
  const page = String(window.location.pathname || "").split("/").pop();
  const role = String(user?.role || "").toLowerCase();
  if (page === "dashboard.html" && !["admin", "super_admin", "system_admin"].includes(role)) {
    const target = workspaceForRole(role);
    if (target && target !== "dashboard.html") window.location.replace(target);
  }
}


function menuAllowedForRole(node) {
  const role = normalizeUserRole(user?.role || "sales");

  if (["admin","super_admin","system_admin","owner","director","ceo"].includes(role)) return true;

  const text = `${node?.title || ""} ${node?.url || ""}`.toLowerCase();

  const salesAllowed = [
    "workspace","lead","quick","follow","vehicle-status","communication","notification",
    "timeline","booking","test","field"
  ];

  const managerAllowed = [
    "workspace","lead","quick","follow","vehicle-status","communication","notification",
    "timeline","booking","booking-allocation","delivery-readiness","approval","report",
    "showroom","qr"
  ];

  const receptionistAllowed = [
    "workspace","showroom","qr","quick","lead","notification","timeline"
  ];

  const digitalAllowed = [
    "workspace","lead","quick","follow","communication","notification","timeline",
    "report","showroom","qr","data change approvals"
  ];

  const telecallerAllowed = [
    "workspace","lead","quick","follow","communication","notification","timeline"
  ];

  let allowed = salesAllowed;
  if (["manager","team_leader","branch_manager"].includes(role)) allowed = managerAllowed;
  if (role === "receptionist") allowed = receptionistAllowed;
  if (role === "digital_marketing") allowed = digitalAllowed;
  if (role === "telecaller") allowed = telecallerAllowed;

  if (!node.url && node.children) return node.children.some(child => menuAllowedForRole(child));

  return allowed.some(k => text.includes(k));
}

function normalizeUserRole(value) {
  const role = String(value || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  const aliases = {
    reception: "receptionist",
    frontoffice: "receptionist",
    front_office: "receptionist",
    frontdesk: "receptionist",
    front_desk: "receptionist",
    cre: "receptionist",
    customer_relation_executive: "receptionist",
    salesperson: "sales",
    sales_person: "sales",
    sales_executive: "sales",
    sales_consultant: "sales",
    sales_advisor: "sales",
    digital_marketer: "digital_marketing",
    digital_marketing_manager: "digital_marketing",
    marketing_manager: "digital_marketing",
    online_marketing: "digital_marketing",
    sales_manager: "manager",
    bm: "branch_manager",
    crm_executive: "telecaller",
    tele_caller: "telecaller",
    telecalling: "telecaller",
    tele_calling: "telecaller"
  };
  return aliases[role] || role || "sales";
}
