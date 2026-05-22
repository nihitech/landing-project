let salesWorkspaceData = { leads: [], notifications: [] };

if (!token) window.location.href = "login.html";

function isToday(dateValue) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;
  return d.toDateString() === new Date().toDateString();
}

function isOverdue(dateValue) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;
  return d < new Date();
}

async function loadSalesWorkspace() {
  try {
    const [leads, notifications] = await Promise.all([
      request(`${API}/leads`, { headers: authHeaders() }),
      request(`${API}/notifications?mine=true`, { headers: authHeaders() }).catch(() => [])
    ]);

    salesWorkspaceData.leads = Array.isArray(leads) ? leads : [];
    salesWorkspaceData.notifications = Array.isArray(notifications) ? notifications : [];
    renderSalesWorkspace();
  } catch (err) {
    console.error("SALES WORKSPACE LOAD ERROR:", err);
    toast(err.message || "Failed to load sales workspace", true);
  }
}

function renderSalesWorkspace() {
  const leads = salesWorkspaceData.leads || [];
  const notifications = salesWorkspaceData.notifications || [];
  const todayFollowups = leads.filter(l => isToday(l.next_followup_at || l.next_followup_date));
  const missedFollowups = leads.filter(l => !["CLOSED", "LOST"].includes(String(l.status || "").toUpperCase()) && isOverdue(l.next_followup_at || l.next_followup_date));

  document.getElementById("myLeads").innerText = leads.length;
  document.getElementById("todayFollowups").innerText = todayFollowups.length;
  document.getElementById("missedFollowups").innerText = missedFollowups.length;
  document.getElementById("unreadNotifications").innerText = notifications.filter(n => !n.is_read).length;

  renderTodayFollowups(todayFollowups);
  renderReminders(missedFollowups, notifications);
  renderStatusBoard(leads);
  renderTaskQueue(leads, todayFollowups, missedFollowups);
  renderNotifications(notifications);
  loadDashboardVehicleOptions();
}


function renderTodayFollowups(todayFollowups) {
  const box = document.getElementById("todayFollowupList");
  if (!box) return;

  box.innerHTML = todayFollowups.slice(0, 10).map(lead => leadTaskRow(lead, "Today Follow-up")).join("") ||
    `<div class="workspace-empty">No follow-ups scheduled for today.</div>`;
}

function renderReminders(missedFollowups, notifications) {
  const box = document.getElementById("reminderList");
  if (!box) return;

  const urgentNotifications = (notifications || []).filter(n => !n.is_read && ["HIGH", "CRITICAL"].includes(String(n.priority || "").toUpperCase()));

  const reminderHtml = [
    ...missedFollowups.slice(0, 6).map(lead => leadTaskRow(lead, "Missed Follow-up")),
    ...urgentNotifications.slice(0, 4).map(n => `
      <div class="role-task-item alert-task">
        <div>
          <strong>${safe(n.title || "Reminder")}</strong>
          <small>${safe(n.message || "")}</small>
          <small>${fmtDate(n.created_at)}</small>
        </div>
        <div class="role-task-actions">
          ${n.action_url ? `<a href="${safe(n.action_url)}" class="qr-open-btn">Open</a>` : ""}
          <a href="notifications.html" class="copy-btn">Alerts</a>
        </div>
      </div>
    `)
  ].join("");

  box.innerHTML = reminderHtml || `<div class="workspace-empty">No urgent reminders.</div>`;
}

function renderStatusBoard(leads) {
  const box = document.getElementById("statusBoard");
  if (!box) return;

  const statuses = ["NEW", "CONTACTED", "FOLLOW-UP", "TEST-DRIVE", "BOOKED", "CLOSED", "LOST"];

  box.innerHTML = statuses.map(status => {
    const count = leads.filter(l => String(l.status || "NEW").toUpperCase() === status).length;
    return `
      <div class="sales-status-card">
        <span>${safe(status)}</span>
        <strong>${count}</strong>
      </div>
    `;
  }).join("");
}

function setDashOptions(selectId, values, placeholder) {
  const el = document.getElementById(selectId);
  if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>` + (values || []).map(v => `<option value="${safe(v)}">${safe(v)}</option>`).join("");
}

async function loadDashboardVehicleOptions() {
  try {
    const category = document.getElementById("dashVehicleCategory")?.value || "AD";
    const data = await request(`${API}/vehicle-intelligence/options?category=${encodeURIComponent(category)}`, {
      headers: authHeaders()
    });

    setDashOptions("dashVehicleModel", data.models || [], "Select Model");
    setDashOptions("dashVehicleVariant", [], "Select Variant");
    setDashOptions("dashVehicleFuel", data.fuels || [], "Select Fuel");
    setDashOptions("dashVehicleColor", data.colors || [], "Select Color");
    renderDashboardVehicleStatus();
  } catch (err) {
    renderDashboardVehicleStatus("Vehicle status could not be loaded now.");
  }
}

async function loadDashboardVariantOptions() {
  try {
    const category = document.getElementById("dashVehicleCategory")?.value || "AD";
    const model = document.getElementById("dashVehicleModel")?.value || "";

    if (!model) {
      setDashOptions("dashVehicleVariant", [], "Select Variant");
      renderDashboardVehicleStatus();
      return;
    }

    const [variants, colors, fuels] = await Promise.all([
      request(`${API}/vehicle-intelligence/variants?category=${encodeURIComponent(category)}&model=${encodeURIComponent(model)}`, { headers: authHeaders() }).catch(() => []),
      request(`${API}/vehicle-intelligence/colors?category=${encodeURIComponent(category)}&model=${encodeURIComponent(model)}`, { headers: authHeaders() }).catch(() => []),
      request(`${API}/vehicle-intelligence/fuels?category=${encodeURIComponent(category)}&model=${encodeURIComponent(model)}`, { headers: authHeaders() }).catch(() => [])
    ]);

    setDashOptions("dashVehicleVariant", variants || [], "Select Variant");
    setDashOptions("dashVehicleFuel", fuels || [], "Select Fuel");
    setDashOptions("dashVehicleColor", colors || [], "Select Color");
    renderDashboardVehicleStatus();
  } catch (err) {
    renderDashboardVehicleStatus("Variant status could not be loaded now.");
  }
}

function renderDashboardVehicleStatus(message = "") {
  const box = document.getElementById("dashboardVehicleStatusBox");
  if (!box) return;

  const category = document.getElementById("dashVehicleCategory")?.value || "";
  const model = document.getElementById("dashVehicleModel")?.value || "";
  const variant = document.getElementById("dashVehicleVariant")?.value || "";
  const fuel = document.getElementById("dashVehicleFuel")?.value || "";
  const color = document.getElementById("dashVehicleColor")?.value || "";

  box.innerHTML = `
    <strong>Customer Option Check</strong>
    <small>${message || "Use this before calling/confirming customer preference. Detailed VIN allotment happens after booking."}</small>
    <div class="vehicle-status-mini-grid">
      <span>Category: <b>${safe(category || "-")}</b></span>
      <span>Model: <b>${safe(model || "Select model")}</b></span>
      <span>Variant: <b>${safe(variant || "-")}</b></span>
      <span>Fuel: <b>${safe(fuel || "-")}</b></span>
      <span>Color: <b>${safe(color || "-")}</b></span>
    </div>
  `;
}


function leadTaskRow(lead, label) {
  const followDate = lead.next_followup_at || lead.next_followup_date;
  return `<div class="role-task-item"><div><strong>${safe(lead.name || "Customer")}</strong><small>${safe(lead.phone || "")} • ${safe(lead.status || "NEW")} • ${safe(label)}</small><small>${followDate ? "Follow-up: " + fmtDate(followDate) : safe(lead.car_interest || "")}</small></div><div class="role-task-actions"><a href="customer-timeline.html?lead=${lead.id}" class="qr-open-btn">Timeline</a><a href="leads.html?lead=${lead.id}" class="copy-btn">Open</a>${lead.phone ? `<a href="tel:${cleanPhone(lead.phone)}" class="copy-btn">Call</a>` : ""}</div></div>`;
}

function renderTaskQueue(leads, todayFollowups, missedFollowups) {
  const tasks = [
    ...missedFollowups.map(l => ({ lead: l, label: "Missed Follow-up" })),
    ...todayFollowups.map(l => ({ lead: l, label: "Today Follow-up" })),
    ...leads.filter(l => String(l.status || "").toUpperCase() === "NEW").map(l => ({ lead: l, label: "New Lead" }))
  ];
  document.getElementById("taskQueue").innerHTML = tasks.slice(0, 12).map(t => leadTaskRow(t.lead, t.label)).join("") || `<div class="workspace-empty">No priority tasks now.</div>`;
}

function renderNotifications(notifications) {
  document.getElementById("notificationTable").innerHTML = notifications.slice(0, 8).map(n => `<tr class="${n.is_read ? "" : "highlight-row"}"><td><strong>${safe(n.title || "-")}</strong><small>${safe(n.message || "")}</small></td><td>${safe(n.notification_type || "-")}</td><td>${safe(n.priority || "-")}</td><td>${fmtDate(n.created_at)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty-state">No notifications</td></tr>`;
}

function renderProductivity(leads, todayFollowups, missedFollowups) {
  const contacted = leads.filter(l => ["CONTACTED", "FOLLOW-UP", "TEST-DRIVE", "BOOKED", "CLOSED"].includes(String(l.status || "").toUpperCase())).length;
  const booked = leads.filter(l => String(l.status || "").toUpperCase() === "BOOKED").length;
  document.getElementById("productivityBox").innerHTML = `<div class="productivity-line"><span>Contacted / Active</span><strong>${contacted}</strong></div><div class="productivity-line"><span>Booked</span><strong>${booked}</strong></div><div class="productivity-line"><span>Today's Follow-ups</span><strong>${todayFollowups.length}</strong></div><div class="productivity-line"><span>Missed Follow-ups</span><strong>${missedFollowups.length}</strong></div>`;
}

window.loadSalesWorkspace = loadSalesWorkspace;
window.onload = loadSalesWorkspace;


/* Salesperson Operational Workflow v1 */
let salesVehicleOptions = {
  models: [],
  variants: [],
  fuels: [],
  colors: []
};

function openSalesEnquiryModal() {
  const modal = document.getElementById("salesEnquiryModal");
  if (!modal) return;
  modal.classList.add("show");
  loadSalesVehicleOptions();
}

function closeSalesEnquiryModal() {
  const modal = document.getElementById("salesEnquiryModal");
  if (!modal) return;
  modal.classList.remove("show");
}

function setOptions(selectId, values, placeholder) {
  const el = document.getElementById(selectId);
  if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>` + (values || []).map(v => `<option value="${safe(v)}">${safe(v)}</option>`).join("");
}

async function loadSalesVehicleOptions() {
  try {
    const category = document.getElementById("se_vehicle_category")?.value || "AD";
    const data = await request(`${API}/vehicle-intelligence/options?category=${encodeURIComponent(category)}`, {
      headers: authHeaders()
    });

    salesVehicleOptions = data || { models: [], variants: [], fuels: [], colors: [] };
    setOptions("se_car_interest", salesVehicleOptions.models || [], "Select Model");
    setOptions("se_variant_interest", [], "Select Variant");
    setOptions("se_fuel_type", salesVehicleOptions.fuels || [], "Select Fuel");
    setOptions("se_preferred_color", salesVehicleOptions.colors || [], "Select Color");

    renderSalesVehicleStatus();
  } catch (err) {
    console.warn("Vehicle options failed:", err.message);
    renderSalesVehicleStatus("Vehicle status currently unavailable.");
  }
}

async function loadSalesVariantOptions() {
  try {
    const category = document.getElementById("se_vehicle_category")?.value || "AD";
    const model = document.getElementById("se_car_interest")?.value || "";

    if (!model) {
      setOptions("se_variant_interest", [], "Select Variant");
      renderSalesVehicleStatus();
      return;
    }

    const [variants, colors, fuels] = await Promise.all([
      request(`${API}/vehicle-intelligence/variants?category=${encodeURIComponent(category)}&model=${encodeURIComponent(model)}`, { headers: authHeaders() }).catch(() => []),
      request(`${API}/vehicle-intelligence/colors?category=${encodeURIComponent(category)}&model=${encodeURIComponent(model)}`, { headers: authHeaders() }).catch(() => []),
      request(`${API}/vehicle-intelligence/fuels?category=${encodeURIComponent(category)}&model=${encodeURIComponent(model)}`, { headers: authHeaders() }).catch(() => [])
    ]);

    setOptions("se_variant_interest", variants || [], "Select Variant");
    setOptions("se_fuel_type", fuels || [], "Select Fuel");
    setOptions("se_preferred_color", colors || [], "Select Color");

    renderSalesVehicleStatus();
  } catch (err) {
    console.warn("Variant load failed:", err.message);
    renderSalesVehicleStatus("Selected model status loaded partially.");
  }
}

function renderSalesVehicleStatus(message = "") {
  const box = document.getElementById("salesVehicleStatusBox");
  if (!box) return;

  const model = document.getElementById("se_car_interest")?.value || "";
  const variant = document.getElementById("se_variant_interest")?.value || "";
  const fuel = document.getElementById("se_fuel_type")?.value || "";
  const color = document.getElementById("se_preferred_color")?.value || "";

  box.innerHTML = `
    <strong>Vehicle Status View</strong>
    <small>${message || "Sales user can view model/variant/fuel/color status only. Stock allocation remains controlled by booking/inventory workflow."}</small>
    <div class="vehicle-status-mini-grid">
      <span>Model: <b>${safe(model || "Not selected")}</b></span>
      <span>Variant: <b>${safe(variant || "Not selected")}</b></span>
      <span>Fuel: <b>${safe(fuel || "Not selected")}</b></span>
      <span>Color: <b>${safe(color || "Not selected")}</b></span>
    </div>
  `;
}

function salesEnquiryPayload() {
  return {
    customer_name: document.getElementById("se_customer_name")?.value.trim(),
    phone: document.getElementById("se_phone")?.value.trim(),
    alternate_phone: document.getElementById("se_alternate_phone")?.value.trim(),
    email: document.getElementById("se_email")?.value.trim(),
    vehicle_category: document.getElementById("se_vehicle_category")?.value,
    car_interest: document.getElementById("se_car_interest")?.value,
    variant_interest: document.getElementById("se_variant_interest")?.value,
    fuel_type: document.getElementById("se_fuel_type")?.value,
    preferred_color: document.getElementById("se_preferred_color")?.value,
    area: document.getElementById("se_area")?.value.trim(),
    district: document.getElementById("se_district")?.value.trim(),
    source_type: document.getElementById("se_source_type")?.value,
    source_details: "Sales workspace enquiry",
    notes: document.getElementById("se_notes")?.value.trim()
  };
}

async function submitSalesEnquiry() {
  const payload = salesEnquiryPayload();

  if (!payload.customer_name) return toast("Customer name is required", true);
  if (!cleanPhone(payload.phone) || cleanPhone(payload.phone).length !== 10) return toast("Valid 10 digit phone is required", true);
  if (!payload.vehicle_category) return toast("Vehicle category is required", true);
  if (!payload.car_interest) return toast("Vehicle model is required", true);

  try {
    const result = await request(`${API}/quick-enquiries`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(payload)
    });

    toast("New enquiry created under Quick Enquiries");
    closeSalesEnquiryModal();

    if (result?.quick_enquiry?.id && confirm("Send OTP now for customer validation?")) {
      await sendSalesQuickOtp(result.quick_enquiry.id);
    }

    await loadSalesWorkspace();
  } catch (err) {
    toast(err.message || "Failed to create enquiry", true);
  }
}

async function sendSalesQuickOtp(quickId) {
  try {
    const res = await request(`${API}/quick-enquiries/${quickId}/send-otp`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({})
    });

    const otpValue = res.dev_otp ? `\nDEV OTP: ${res.dev_otp}` : "";
    const entered = prompt(`OTP sent to customer. Enter OTP to verify.${otpValue}`);

    if (!entered) return;

    await request(`${API}/quick-enquiries/${quickId}/verify-otp`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ otp: entered })
    });

    toast("OTP verified. Enquiry ready for completion/next stage.");
  } catch (err) {
    toast(err.message || "OTP verification failed", true);
  }
}

function openVehicleStatusFromWorkspace() {
  window.location.href = "vehicle-status.html";
}

window.openSalesEnquiryModal = openSalesEnquiryModal;
window.closeSalesEnquiryModal = closeSalesEnquiryModal;
window.loadSalesVehicleOptions = loadSalesVehicleOptions;
window.loadSalesVariantOptions = loadSalesVariantOptions;
window.submitSalesEnquiry = submitSalesEnquiry;
window.sendSalesQuickOtp = sendSalesQuickOtp;
window.openVehicleStatusFromWorkspace = openVehicleStatusFromWorkspace;


window.loadDashboardVehicleOptions = loadDashboardVehicleOptions;
window.loadDashboardVariantOptions = loadDashboardVariantOptions;
