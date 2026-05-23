let WS={leads:[],notifications:[],communications:[],queries:[],role:"sales",config:null};
if(!token)window.location.href="login.html";
const CFG={
 sales:{title:"Sales Workspace",tag:"Sales Operations",sub:"Own leads, follow-ups, OTP validation, customer vehicle checks and booking/test drive movement.",actions:[["+ New Enquiry","sales-dashboard.html","save-btn"],["My Leads","leads.html","copy-btn"],["Vehicle Status","vehicle-status.html","copy-btn"],["Communications","communications.html","copy-btn"],["Timeline","customer-timeline.html","copy-btn"]]},
 receptionist:{title:"Reception Workspace",tag:"Showroom Reception",sub:"QR sessions, showroom visit enquiries, manual enquiry capture and assignment queue.",actions:[["Create QR Session","showroom-qr-admin.html","save-btn"],["Showroom Enquiries","showroom-qr-admin.html","copy-btn"],["Quick Enquiry","quick-enquiries.html","copy-btn"],["Notifications","notifications.html","copy-btn"]]},
 manager:{title:"Manager Workspace",tag:"Team Management",sub:"Team leads, pending approvals, workload, escalations and sales performance.",actions:[["Team Leads","leads.html","save-btn"],["Approvals","data-change-approvals.html","copy-btn"],["Notifications","notifications.html","copy-btn"],["Reports","reports.html","copy-btn"],["Timeline","customer-timeline.html","copy-btn"]]},
 executive:{title:"Executive Workspace",tag:"Executive Intelligence",sub:"Branch intelligence, approvals, escalations, reports and business control overview.",actions:[["Reports","reports.html","save-btn"],["Analytics","analytics.html","copy-btn"],["Governance","governance-matrix.html","copy-btn"],["Approvals","data-change-approvals.html","copy-btn"]]},
 admin:{title:"Control Center",tag:"System Admin",sub:"System administration, configuration and technical controls.",actions:[["Users","users.html","save-btn"],["Permissions","permissions.html","copy-btn"],["Branches","branches.html","copy-btn"],["Dashboard","dashboard.html","copy-btn"]]}
};
function wsRole(){const r=String(user?.role||"sales").toLowerCase();if(["receptionist","front_office","cre","customer_relation_executive"].includes(r))return"receptionist";if(["manager","sales_manager","team_leader","branch_manager","bm"].includes(r))return"manager";if(["gm","dgm","md","ceo","director","owner"].includes(r))return"executive";if(["admin","super_admin","system_admin"].includes(r))return"admin";return"sales";}
function isToday(v){if(!v)return false;const d=new Date(v);return !Number.isNaN(d.getTime())&&d.toDateString()===new Date().toDateString();}
function isOverdue(v){if(!v)return false;const d=new Date(v);return !Number.isNaN(d.getTime())&&d<new Date();}
async function loadWorkspaceEngine(){try{WS.role=wsRole();WS.config=CFG[WS.role]||CFG.sales;const [l,n,c,q]=await Promise.all([request(`${API}/leads`,{headers:authHeaders()}).catch(()=>[]),request(`${API}/notifications?mine=true`,{headers:authHeaders()}).catch(()=>[]),request(`${API}/communications/logs`,{headers:authHeaders()}).catch(()=>[]),request(`${API}/process-actions/queries`,{headers:authHeaders()}).catch(()=>[])]);WS.leads=Array.isArray(l)?l:[];WS.notifications=Array.isArray(n)?n:[];WS.communications=Array.isArray(c)?c:[];WS.queries=Array.isArray(q)?q:[];renderWS();}catch(e){console.error(e);toast(e.message||"Failed to load workspace",true);}}
function renderWS(){const c=WS.config;document.getElementById("workspaceRoleTag").innerText=c.tag;document.getElementById("workspaceTitle").innerText=c.title;document.getElementById("workspaceSubtitle").innerText=c.sub;renderProfile();renderKpis();renderPrimary();renderActions();}
function renderProfile(){const name=user?.name||user?.email||"Operator",role=String(user?.role||"user").replace(/_/g," ").toUpperCase();document.getElementById("profileWidget").innerHTML=`<div class="workspace-avatar">${safe(String(name).charAt(0).toUpperCase())}</div><div><strong>${safe(name)}</strong><small>${safe(role)} • ${safe(user?.branch_name||user?.branch_id||"Assigned Branch")}</small></div><div class="workspace-score"><span>Workspace</span><b>${safe(WS.config.tag)}</b></div>`;}
function renderKpis(){const leads=WS.leads,n=WS.notifications,today=leads.filter(l=>isToday(l.next_followup_at||l.next_followup_date)),missed=leads.filter(l=>!["CLOSED","LOST"].includes(String(l.status||"").toUpperCase())&&isOverdue(l.next_followup_at||l.next_followup_date)),booked=leads.filter(l=>String(l.status||"").toUpperCase()==="BOOKED");document.getElementById("workspaceKpis").innerHTML=`<div class="summary-card"><span>Leads</span><strong>${leads.length}</strong></div><div class="summary-card"><span>Today's Follow-ups</span><strong>${today.length}</strong></div><div class="summary-card"><span>Missed Follow-ups</span><strong>${missed.length}</strong></div><div class="summary-card"><span>Booked</span><strong>${booked.length}</strong></div><div class="summary-card"><span>Unread Alerts</span><strong>${n.filter(x=>!x.is_read).length}</strong></div>`;}
function card(t,s,b){return`<section class="table-card workspace-widget-card"><div class="page-header"><h2>${safe(t)}</h2><p>${safe(s||"")}</p></div>${b}</section>`;}
function leadRow(l,label){return`<div class="role-task-item"><div><strong>${safe(l.name||"Customer")}</strong><small>${safe(l.phone||"")} • ${safe(l.status||"NEW")} • ${safe(label||"")}</small><small>${safe(l.car_interest||"")} ${(l.next_followup_at||l.next_followup_date)?"• "+fmtDate(l.next_followup_at||l.next_followup_date):""}</small></div><div class="role-task-actions"><a href="customer-timeline.html?lead=${l.id}" class="qr-open-btn">Timeline</a><a href="leads.html?lead=${l.id}" class="copy-btn">Open</a>${l.phone?`<a href="tel:${cleanPhone(l.phone)}" class="copy-btn">Call</a>`:""}</div>${typeof processLeadActionButtons==="function"?processLeadActionButtons(l):""}</div>`;}
function statusBoard(){const st=["NEW","CONTACTED","FOLLOW-UP","TEST-DRIVE","BOOKED","CLOSED","LOST"];return`<div class="sales-status-board">${st.map(s=>`<div class="sales-status-card"><span>${s}</span><strong>${WS.leads.filter(l=>String(l.status||"NEW").toUpperCase()===s).length}</strong></div>`).join("")}</div>`;}
function notifList(){return WS.notifications.slice(0,10).map(n=>`<div class="role-task-item ${n.is_read?"":"alert-task"}"><div><strong>${safe(n.title||"Notification")}</strong><small>${safe(n.message||"")}</small><small>${safe(n.notification_type||"")} • ${safe(n.priority||"")} • ${fmtDate(n.created_at)}</small></div><div class="role-task-actions">${n.action_url?`<a href="${safe(n.action_url)}" class="qr-open-btn">Open</a>`:""}<a href="notifications.html" class="copy-btn">Alerts</a></div></div>`).join("")||`<div class="workspace-empty">No notifications.</div>`;}

function queryListHtml() {
  const q = (WS.queries || []).slice(0, 12);
  return q.map(item => `
    <div class="role-task-item query-task ${item.query_status === "OPEN" ? "alert-task" : ""}">
      <div>
        <strong>${safe(item.title || "Query")}</strong>
        <small>${safe(item.raised_by_name || "Salesperson")} • ${safe(item.priority || "NORMAL")} • ${safe(item.query_status || "OPEN")}</small>
        <small>${safe(item.message || "")}</small>
        ${item.answer ? `<small><b>Answer:</b> ${safe(item.answer)}</small>` : ""}
      </div>
      <div class="role-task-actions">
        ${item.lead_id ? `<a href="customer-timeline.html?lead=${item.lead_id}" class="qr-open-btn">Timeline</a>` : ""}
        ${item.query_status === "OPEN" && typeof answerProcessQuery === "function" ? `<button onclick="answerProcessQuery(${item.id})" class="save-btn">Answer</button>` : ""}
      </div>
    </div>
  `).join("") || `<div class="workspace-empty">No salesperson queries.</div>`;
}

function teamLeadListHtml() {
  const leads = (WS.leads || []).slice(0, 12);
  return leads.map(l => `
    <div class="role-task-item">
      <div>
        <strong>${safe(l.name || "Customer")}</strong>
        <small>${safe(l.phone || "")} • ${safe(l.status || "NEW")} • Assigned: ${safe(l.assigned_user_name || l.assigned_to || "-")}</small>
        <small>${safe(l.car_interest || "")}</small>
      </div>
      <div class="role-task-actions">
        <a href="customer-timeline.html?lead=${l.id}" class="qr-open-btn">Timeline</a>
        <a href="leads.html?lead=${l.id}" class="copy-btn">Open</a>
        ${typeof openManagerReassign === "function" ? `<button onclick="openManagerReassign(${l.id})" class="copy-btn">Reassign</button>` : ""}
      </div>
    </div>
  `).join("") || `<div class="workspace-empty">No team leads found.</div>`;
}

function approvalSummaryHtml() {
  const openQueries = (WS.queries || []).filter(q => q.query_status === "OPEN").length;
  const unreadAlerts = (WS.notifications || []).filter(n => !n.is_read).length;
  return `
    <div class="sales-status-board">
      <div class="sales-status-card"><span>Open Queries</span><strong>${openQueries}</strong></div>
      <div class="sales-status-card"><span>Unread Alerts</span><strong>${unreadAlerts}</strong></div>
      <div class="sales-status-card"><span>Total Team Leads</span><strong>${(WS.leads || []).length}</strong></div>
      <div class="sales-status-card"><span>Bookings</span><strong>${(WS.leads || []).filter(l => String(l.status || "").toUpperCase() === "BOOKED").length}</strong></div>
    </div>
  `;
}

function renderPrimary(){const today=WS.leads.filter(l=>isToday(l.next_followup_at||l.next_followup_date)),missed=WS.leads.filter(l=>!["CLOSED","LOST"].includes(String(l.status||"").toUpperCase())&&isOverdue(l.next_followup_at||l.next_followup_date));let h="";if(WS.role==="sales"){h+=card("Today's Follow-up Leads","Customers to contact today.",today.slice(0,10).map(l=>leadRow(l,"Today Follow-up")).join("")||`<div class="workspace-empty">No follow-ups today.</div>`);h+=card("Reminder & Escalation","Missed follow-ups and urgent alerts.",missed.slice(0,8).map(l=>leadRow(l,"Missed Follow-up")).join("")||`<div class="workspace-empty">No urgent reminders.</div>`);h+=card("Lead Status Board","Pipeline status summary.",statusBoard());}else if(WS.role==="receptionist"){h+=card("Showroom Operations","QR and showroom enquiry actions.",`<div class="role-quick-actions"><a href="showroom-qr-admin.html" class="save-btn">Create / Manage QR Session</a><a href="quick-enquiries.html" class="copy-btn">Manual Showroom Enquiry</a><a href="leads.html" class="copy-btn">Assigned Leads</a></div>`);h+=card("Recent Notifications","Showroom alerts.",notifList());}else{h+=card("Manager Control Summary","Team workload, queries and alerts.",approvalSummaryHtml());h+=card("Salesperson Queries","Questions and suggestions raised by sales users.",queryListHtml());h+=card("Team / Branch Leads","Lead monitoring with timeline and reassignment action.",teamLeadListHtml());h+=card("Pending Alerts","Approvals, escalations and reminders.",notifList());}document.getElementById("primaryWidgets").innerHTML=h;}
function renderActions(){let acts=(WS.config.actions||[]).map(a=>`<a href="${safe(a[1])}" class="${safe(a[2])}">${safe(a[0])}</a>`).join("");let vehicle=["sales","manager"].includes(WS.role)?card("Vehicle Status Check","Read-only customer option check.",`<div class="role-quick-actions"><a href="vehicle-status.html" class="copy-btn">Open Vehicle Status</a></div>`):"";document.getElementById("actionWidgets").innerHTML=card("Process Actions","Buttons based on your role and workflow.",`<div class="role-quick-actions">${acts}</div>`)+vehicle;}
window.loadWorkspaceEngine=loadWorkspaceEngine;window.onload=loadWorkspaceEngine;