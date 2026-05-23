/*
  NIKRION Department-wise Role Workspace v1
  One core workspace. Widgets/buttons change by department role.
*/

let WS = {
  leads: [],
  notifications: [],
  communications: [],
  queries: [],
  role: "sales",
  config: null
};

if (!token) window.location.href = "login.html";

const ROLE_CONFIG = {
  sales: {
    title: "Sales Person Workspace",
    tag: "Sales Department",
    sub: "Own leads, follow-ups, quick enquiry, OTP validation, test drive, booking initiation and vehicle status.",
    widgets: ["profile","kpis","sales_followups","lead_status","vehicle_check","notifications","actions"],
    actions: [
      ["+ Quick Enquiry", "sales-dashboard.html", "save-btn"],
      ["My Leads", "leads.html", "copy-btn"],
      ["Follow-ups", "followups.html", "copy-btn"],
      ["Vehicle Status", "vehicle-status.html", "copy-btn"],
      ["Bookings", "bookings.html", "copy-btn"],
      ["Field Activity", "field-activities.html", "copy-btn"]
    ]
  },
  manager: {
    title: "Sales Manager Workspace",
    tag: "Sales Management",
    sub: "Monitor team, leads, follow-ups, booking/test drive status, vehicle allotment, QR enquiry data and performance.",
    widgets: ["profile","kpis","team_overview","query_inbox","lead_status","notifications","actions"],
    actions: [
      ["Team Leads", "leads.html", "save-btn"],
      ["Booking Allocation", "booking-allocation.html", "copy-btn"],
      ["Delivery Readiness", "delivery-readiness.html", "copy-btn"],
      ["Approvals", "data-change-approvals.html", "copy-btn"],
      ["Reports", "reports.html", "copy-btn"],
      ["QR Enquiries", "showroom-qr-admin.html", "copy-btn"]
    ]
  },
  receptionist: {
    title: "Receptionist Workspace",
    tag: "Showroom Reception",
    sub: "Daily showroom enquiry monitoring, QR generation, manual enquiry capture and assignment support.",
    widgets: ["profile","reception_kpis","reception_actions","notifications"],
    actions: [
      ["Create Daily QR", "showroom-qr-admin.html", "save-btn"],
      ["Manual Enquiry", "quick-enquiries.html", "copy-btn"],
      ["Showroom Leads", "leads.html", "copy-btn"],
      ["Notifications", "notifications.html", "copy-btn"]
    ]
  },
  digital_marketing: {
    title: "Digital Marketing Workspace",
    tag: "Digital Lead Control",
    sub: "Monitor digital/field/QR leads, follow-ups, reassignment, telecalling assignment and digital team performance.",
    widgets: ["profile","kpis","digital_lead_monitor","lead_status","notifications","actions"],
    actions: [
      ["All Leads", "leads.html", "save-btn"],
      ["Quick Enquiries", "quick-enquiries.html", "copy-btn"],
      ["QR Leads", "showroom-qr-admin.html", "copy-btn"],
      ["Communications", "communications.html", "copy-btn"],
      ["Reports", "reports.html", "copy-btn"],
      ["Data Change Approvals", "data-change-approvals.html", "copy-btn"]
    ]
  },
  telecaller: {
    title: "Telecalling Workspace",
    tag: "Customer Validation",
    sub: "Call customers, verify details, complete enquiry, update follow-ups and report every update with employee accountability.",
    widgets: ["profile","telecalling_queue","lead_status","notifications","actions"],
    actions: [
      ["Calling Leads", "leads.html", "save-btn"],
      ["Follow-ups", "followups.html", "copy-btn"],
      ["Communications", "communications.html", "copy-btn"],
      ["Customer Timeline", "customer-timeline.html", "copy-btn"]
    ]
  },
  admin: {
    title: "Admin Control Center",
    tag: "System Administration",
    sub: "System configuration, users, permissions and master controls.",
    widgets: ["profile","kpis","lead_status","notifications","actions"],
    actions: [
      ["Users", "users.html", "save-btn"],
      ["Permissions", "permissions.html", "copy-btn"],
      ["Branches", "branches.html", "copy-btn"],
      ["Dashboard", "dashboard.html", "copy-btn"]
    ]
  }
};

function normalizeWorkspaceRole(value) {
  const role = String(value || "sales").trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  const aliases = {
    sales_executive: "sales",
    sales_consultant: "sales",
    sales_person: "sales",
    salesperson: "sales",
    sales_manager: "manager",
    team_leader: "manager",
    branch_manager: "manager",
    bm: "manager",
    front_office: "receptionist",
    frontdesk: "receptionist",
    front_desk: "receptionist",
    reception: "receptionist",
    cre: "receptionist",
    customer_relation_executive: "receptionist",
    digital_marketer: "digital_marketing",
    digital_marketing_manager: "digital_marketing",
    marketing_manager: "digital_marketing",
    telecalling: "telecaller",
    tele_calling: "telecaller",
    crm_executive: "telecaller"
  };
  return aliases[role] || role;
}

function wsRole() {
  const role = normalizeWorkspaceRole(user?.role || "sales");
  if (["admin","super_admin","system_admin","owner","director","ceo"].includes(role)) return "admin";
  if (ROLE_CONFIG[role]) return role;
  return "sales";
}

function isToday(v) {
  if (!v) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
}

function isOverdue(v) {
  if (!v) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d < new Date();
}

async function loadWorkspaceEngine() {
  try {
    WS.role = wsRole();
    WS.config = ROLE_CONFIG[WS.role] || ROLE_CONFIG.sales;

    const [leads, notifications, communications, queries] = await Promise.all([
      request(`${API}/leads`, { headers: authHeaders() }).catch(() => []),
      request(`${API}/notifications?mine=true`, { headers: authHeaders() }).catch(() => []),
      request(`${API}/communications/logs`, { headers: authHeaders() }).catch(() => []),
      request(`${API}/process-actions/queries`, { headers: authHeaders() }).catch(() => [])
    ]);

    WS.leads = Array.isArray(leads) ? leads : [];
    WS.notifications = Array.isArray(notifications) ? notifications : [];
    WS.communications = Array.isArray(communications) ? communications : [];
    WS.queries = Array.isArray(queries) ? queries : [];

    renderWorkspace();
  } catch (err) {
    console.error("WORKSPACE LOAD ERROR:", err);
    toast(err.message || "Failed to load workspace", true);
  }
}

function renderWorkspace() {
  document.getElementById("workspaceRoleTag").innerText = WS.config.tag;
  document.getElementById("workspaceTitle").innerText = WS.config.title;
  document.getElementById("workspaceSubtitle").innerText = WS.config.sub;

  renderProfile();
  renderKpis();
  renderPrimaryWidgets();
  renderActions();
}

function renderProfile() {
  const name = user?.name || user?.email || "Operator";
  const role = String(user?.role || "user").replace(/_/g, " ").toUpperCase();

  document.getElementById("profileWidget").innerHTML = `
    <div class="workspace-avatar">${safe(String(name).charAt(0).toUpperCase())}</div>
    <div>
      <strong>${safe(name)}</strong>
      <small>${safe(role)} • ${safe(user?.department_name || user?.department_id || "Department")}</small>
      <small>${safe(user?.branch_name || user?.branch_id || "Branch")}</small>
    </div>
    <div class="workspace-score">
      <span>Role Workspace</span>
      <b>${safe(WS.config.tag)}</b>
    </div>
  `;
}

function renderKpis() {
  const leads = WS.leads;
  const today = leads.filter(l => isToday(l.next_followup_at || l.next_followup_date));
  const missed = leads.filter(l => !["CLOSED","LOST"].includes(String(l.status || "").toUpperCase()) && isOverdue(l.next_followup_at || l.next_followup_date));
  const booked = leads.filter(l => String(l.status || "").toUpperCase() === "BOOKED");
  const unread = WS.notifications.filter(n => !n.is_read);

  document.getElementById("workspaceKpis").innerHTML = `
    <div class="summary-card"><span>Leads</span><strong>${leads.length}</strong></div>
    <div class="summary-card"><span>Today's Follow-ups</span><strong>${today.length}</strong></div>
    <div class="summary-card"><span>Missed Follow-ups</span><strong>${missed.length}</strong></div>
    <div class="summary-card"><span>Bookings</span><strong>${booked.length}</strong></div>
    <div class="summary-card"><span>Unread Alerts</span><strong>${unread.length}</strong></div>
  `;
}

function card(title, subtitle, body) {
  return `<section class="table-card workspace-widget-card"><div class="page-header"><h2>${safe(title)}</h2><p>${safe(subtitle || "")}</p></div>${body}</section>`;
}

function leadRow(lead, label = "") {
  return `
    <div class="role-task-item">
      <div>
        <strong>${safe(lead.name || "Customer")}</strong>
        <small>${safe(lead.phone || "")} • ${safe(lead.status || "NEW")} • ${safe(label)}</small>
        <small>${safe(lead.source || "")} ${lead.car_interest ? "• " + safe(lead.car_interest) : ""}</small>
      </div>
      <div class="role-task-actions">
        <a href="customer-timeline.html?lead=${lead.id}" class="qr-open-btn">Timeline</a>
        <a href="leads.html?lead=${lead.id}" class="copy-btn">Open</a>
        ${lead.phone ? `<a href="tel:${cleanPhone(lead.phone)}" class="copy-btn">Call</a>` : ""}
        ${typeof processLeadActionButtons === "function" ? processLeadActionButtons(lead) : ""}
      </div>
    </div>
  `;
}

function statusBoard() {
  const statuses = ["NEW","CONTACTED","FOLLOW-UP","QUALIFIED","TEST-DRIVE","BOOKED","CLOSED","LOST"];
  return `<div class="sales-status-board">${statuses.map(s => {
    const count = WS.leads.filter(l => String(l.status || "NEW").toUpperCase() === s).length;
    return `<div class="sales-status-card"><span>${safe(s)}</span><strong>${count}</strong></div>`;
  }).join("")}</div>`;
}

function notificationList() {
  return WS.notifications.slice(0, 10).map(n => `
    <div class="role-task-item ${n.is_read ? "" : "alert-task"}">
      <div>
        <strong>${safe(n.title || "Notification")}</strong>
        <small>${safe(n.message || "")}</small>
        <small>${safe(n.notification_type || "")} • ${safe(n.priority || "")} • ${fmtDate(n.created_at)}</small>
      </div>
      <div class="role-task-actions">
        ${n.action_url ? `<a href="${safe(n.action_url)}" class="qr-open-btn">Open</a>` : ""}
        <a href="notifications.html" class="copy-btn">Alerts</a>
      </div>
    </div>
  `).join("") || `<div class="workspace-empty">No notifications.</div>`;
}

function queryList() {
  return WS.queries.slice(0, 10).map(q => `
    <div class="role-task-item ${q.query_status === "OPEN" ? "alert-task" : ""}">
      <div>
        <strong>${safe(q.title || "Query")}</strong>
        <small>${safe(q.raised_by_name || "User")} • ${safe(q.query_status || "OPEN")} • ${safe(q.priority || "NORMAL")}</small>
        <small>${safe(q.message || "")}</small>
        ${q.answer ? `<small><b>Answer:</b> ${safe(q.answer)}</small>` : ""}
      </div>
      <div class="role-task-actions">
        ${q.lead_id ? `<a href="customer-timeline.html?lead=${q.lead_id}" class="qr-open-btn">Timeline</a>` : ""}
        ${q.query_status === "OPEN" && typeof answerProcessQuery === "function" ? `<button onclick="answerProcessQuery(${q.id})" class="save-btn">Answer</button>` : ""}
      </div>
    </div>
  `).join("") || `<div class="workspace-empty">No queries.</div>`;
}

function renderPrimaryWidgets() {
  const today = WS.leads.filter(l => isToday(l.next_followup_at || l.next_followup_date));
  const missed = WS.leads.filter(l => !["CLOSED","LOST"].includes(String(l.status || "").toUpperCase()) && isOverdue(l.next_followup_at || l.next_followup_date));
  const pending = WS.leads.filter(l => ["NEW","CONTACTED","FOLLOW-UP"].includes(String(l.status || "NEW").toUpperCase()));
  const digital = WS.leads.filter(l => ["DIGITAL","WEBSITE","FACEBOOK","INSTAGRAM","GOOGLE","QR","FIELD"].some(s => String(l.source || "").toUpperCase().includes(s)));

  let html = "";

  if (WS.role === "sales") {
    html += card("My Pending Leads", "Open leads and daily customer actions.", pending.slice(0,12).map(l => leadRow(l,"Pending")).join("") || `<div class="workspace-empty">No pending leads.</div>`);
    html += card("Today's Follow-ups", "Scheduled follow-ups and reschedule needs.", today.slice(0,10).map(l => leadRow(l,"Today Follow-up")).join("") || `<div class="workspace-empty">No follow-ups today.</div>`);
    html += card("Reminders", "Missed follow-ups requiring immediate attention.", missed.slice(0,8).map(l => leadRow(l,"Missed")).join("") || `<div class="workspace-empty">No missed reminders.</div>`);
    html += card("Lead Status", "Your lead progress.", statusBoard());
  }

  if (WS.role === "manager") {
    html += card("Team Lead Monitoring", "Branch/team leads, follow-ups and booking/test drive status.", WS.leads.slice(0,12).map(l => leadRow(l,"Team Lead")).join("") || `<div class="workspace-empty">No team leads.</div>`);
    html += card("Salesperson Queries", "Answer doubts and guidance requests.", queryList());
    html += card("Team Status Board", "Overall lead status and performance.", statusBoard());
    html += card("Alerts", "Pending workload, escalations and notifications.", notificationList());
  }

  if (WS.role === "receptionist") {
    html += card("Showroom Reception Actions", "QR and direct showroom enquiry capture.", `<div class="role-quick-actions"><a href="showroom-qr-admin.html" class="save-btn">Generate Daily QR</a><a href="quick-enquiries.html" class="copy-btn">Create Manual Enquiry</a><a href="leads.html" class="copy-btn">Showroom Leads</a></div>`);
    html += card("Reception Notifications", "Assignment and showroom enquiry alerts.", notificationList());
  }

  if (WS.role === "digital_marketing") {
    html += card("Digital / Field / QR Lead Monitoring", "Monitor source-wise leads and assignment status.", digital.slice(0,14).map(l => leadRow(l,"Digital/Source Lead")).join("") || `<div class="workspace-empty">No digital/source leads.</div>`);
    html += card("Follow-up & Assignment Monitoring", "Pending leads requiring follow-up or reassignment.", pending.slice(0,12).map(l => leadRow(l,"Monitor")).join("") || `<div class="workspace-empty">No pending monitored leads.</div>`);
    html += card("Lead Status Board", "Digital and sales pipeline performance.", statusBoard());
    html += card("Notifications", "Lead assignment and pending status alerts.", notificationList());
  }

  if (WS.role === "telecaller") {
    html += card("Calling & Validation Queue", "Call customers, verify details and complete enquiry.", pending.slice(0,14).map(l => leadRow(l,"Call / Verify")).join("") || `<div class="workspace-empty">No calling queue.</div>`);
    html += card("Follow-up Queue", "Customers to call back or reschedule.", today.slice(0,10).map(l => leadRow(l,"Follow-up")).join("") || `<div class="workspace-empty">No follow-ups.</div>`);
    html += card("Lead Status", "Telecalling conversion progress.", statusBoard());
  }

  if (WS.role === "admin") {
    html += card("System Overview", "Admin view of operational data.", statusBoard());
    html += card("Notifications", "System and operational alerts.", notificationList());
  }

  document.getElementById("primaryWidgets").innerHTML = html;
}

function renderActions() {
  const actionHtml = (WS.config.actions || []).map(a => `<a href="${safe(a[1])}" class="${safe(a[2])}">${safe(a[0])}</a>`).join("");

  const vehicleCheck = ["sales","manager"].includes(WS.role)
    ? card("Vehicle Status Check", "Vehicle availability, allotment and location view.", `<div class="role-quick-actions"><a href="vehicle-status.html" class="copy-btn">Open Vehicle Status</a><a href="booking-allocation.html" class="copy-btn">Booking Allocation</a></div>`)
    : "";

  document.getElementById("actionWidgets").innerHTML =
    card("Process Buttons", "Only buttons related to this role are shown.", `<div class="role-quick-actions">${actionHtml}</div>`) +
    vehicleCheck;
}

window.loadWorkspaceEngine = loadWorkspaceEngine;
window.onload = loadWorkspaceEngine;
