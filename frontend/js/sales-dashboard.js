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

  renderTaskQueue(leads, todayFollowups, missedFollowups);
  renderNotifications(notifications);
  renderProductivity(leads, todayFollowups, missedFollowups);
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
