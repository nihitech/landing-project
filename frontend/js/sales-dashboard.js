let workspaceData={};

if(!token){
window.location.href='login.html';
}

async function loadWorkspace(){
try{

const [leads, notifications]=await Promise.all([
request(`${API}/leads`,{
headers:authHeaders()
}),
request(`${API}/notifications?mine=true`,{
headers:authHeaders()
})
]);

workspaceData.leads=Array.isArray(leads)?leads:[];
workspaceData.notifications=Array.isArray(notifications)?notifications:[];

renderWorkspace();

}catch(err){
console.error('SALES WORKSPACE ERROR:',err);
toast(err.message || 'Failed to load sales workspace', true);
}
}

function renderWorkspace(){

const leads=workspaceData.leads || [];
const notifications=workspaceData.notifications || [];

document.getElementById('myLeads').innerText=leads.length;

const missed=leads.filter(l=>{
if(!l.next_followup_at && !l.next_followup_date) return false;
const dt=l.next_followup_at || l.next_followup_date;
return new Date(dt) < new Date();
});

document.getElementById('missedFollowups').innerText=missed.length;

document.getElementById('todayFollowups').innerText=
leads.filter(l=>l.next_followup_at || l.next_followup_date).length;

document.getElementById('unreadNotifications').innerText=
notifications.filter(n=>!n.is_read).length;

document.getElementById('taskQueue').innerHTML=
leads.slice(0,10).map(l=>`
<div class="workspace-task">
<div>
<strong>${safe(l.name || '-')}</strong>
<small>${safe(l.phone || '')}</small>
<small>${safe(l.status || 'NEW')}</small>
</div>

<div class="workspace-actions">
<a href="customer-timeline.html?lead=${l.id}" class="qr-open-btn">
Timeline
</a>

<a href="leads.html?lead=${l.id}" class="copy-btn">
Open
</a>
</div>
</div>
`).join('') || '<div class="workspace-empty">No tasks available</div>';

document.getElementById('notificationTable').innerHTML=
notifications.slice(0,10).map(n=>`
<tr class="${n.is_read ? '' : 'highlight-row'}">
<td>${safe(n.title || '-')}</td>
<td>${safe(n.notification_type || '-')}</td>
<td>${safe(n.priority || '-')}</td>
<td>${fmtDate(n.created_at)}</td>
</tr>
`).join('') || '<tr><td colspan="4" class="empty-state">No notifications</td></tr>';

}

window.loadWorkspace=loadWorkspace;
window.onload=loadWorkspace;
