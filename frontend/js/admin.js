const API = window.CRM_API || "https://landing-backend-8gvq.onrender.com/api";
const token = sessionStorage.getItem("token");
const user = JSON.parse(sessionStorage.getItem("user") || "{}");
let users = [], allLeads = [], priorityChart, actionChart;
const STATUSES = ["NEW", "CONTACTED", "FOLLOW-UP", "TEST-DRIVE", "BOOKED", "CLOSED", "LOST"];

if (!token) window.location.href = "login.html";
if (user.role && user.role !== "admin") window.location.href = "user-dashboard.html";

function authHeaders(json=false){ const h={Authorization:`Bearer ${token}`}; if(json) h["Content-Type"]="application/json"; return h; }
function safe(v){ return String(v ?? "-").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function toast(msg,err=false){ let e=document.getElementById('crmToast'); if(!e){e=document.createElement('div');e.id='crmToast';document.body.appendChild(e);} e.textContent=msg; e.className=`crm-toast show ${err?'error':''}`; setTimeout(()=>e.className='crm-toast',2200); }
async function request(url,opt={}){ const r=await fetch(url,opt); let d={}; try{d=await r.json()}catch{} if(r.status===401) return logout(); if(!r.ok) throw new Error(d.message||'Request failed'); return d; }

async function loadUsers(){ users=await request(`${API}/auth/users`,{headers:authHeaders()}); renderUsersTable(); }
async function loadLeads(){ const p=new URLSearchParams(); const f=document.getElementById('filter')?.value||''; const s=document.getElementById('searchInput')?.value.trim()||''; if(f)p.set('priority',f); if(s)p.set('search',s); allLeads=await request(`${API}/leads?${p}`,{headers:authHeaders()}); renderPipeline(allLeads); renderTable(allLeads); }

function renderTable(leads){
 const tb=document.querySelector('#leadTable tbody'); if(!tb)return;
 if(!leads.length){tb.innerHTML='<tr><td colspan="10" class="empty-state">📭 No leads found</td></tr>';return;}
 tb.innerHTML=leads.map(l=>{ const pc=String(l.priority||'COLD').toLowerCase(); const phone=safe(l.phone).replace(/\D/g,''); const opts=`<option value="">Unassigned</option>`+users.filter(u=>u.role==='sales').map(u=>`<option value="${u.id}" ${Number(l.assigned_to)===Number(u.id)?'selected':''}>${safe(u.name)}</option>`).join('');
 return `<tr class="${pc}"><td><strong>${safe(l.name)}</strong><small>${l.created_at?new Date(l.created_at).toLocaleString():''}</small></td><td>${safe(l.phone)}</td><td>${safe(l.car_interest)}</td><td>${safe(l.action_type)}</td><td>${l.score||0}</td><td><span class="badge ${pc}">${safe(l.priority||'COLD')}</span></td><td><select onchange="updateStatus(${l.id}, this.value)">${STATUSES.map(s=>`<option value="${s}" ${l.status===s?'selected':''}>${s}</option>`).join('')}</select></td><td><select onchange="assignLead(${l.id}, this.value)">${opts}</select></td><td><textarea placeholder="Next follow-up / customer response" onblur="saveNotes(${l.id}, this.value)">${safe(l.notes||'')}</textarea></td><td class="actions"><a href="tel:${phone}" title="Call">📞</a><a href="https://wa.me/91${phone}" target="_blank" title="WhatsApp">💬</a></td></tr>`; }).join('');
}

function renderPipeline(leads){
 const zones={NEW:document.getElementById('new'),CONTACTED:document.getElementById('contacted'),'FOLLOW-UP':document.getElementById('followup'),CLOSED:document.getElementById('closedZone')}; Object.values(zones).forEach(z=>{if(z)z.innerHTML=''}); const c={NEW:0,CONTACTED:0,'FOLLOW-UP':0,CLOSED:0};
 leads.forEach(l=>{ const st=c.hasOwnProperty(l.status)?l.status:'NEW'; c[st]++; const card=document.createElement('div'); card.className=`lead-card ${String(l.priority||'COLD').toLowerCase()}`; card.draggable=true; card.dataset.id=l.id; card.innerHTML=`<strong>${safe(l.name)}</strong><div class="lead-meta">${safe(l.phone)} • ${safe(l.car_interest)}</div><div class="lead-meta">${safe(l.assigned_name||'Unassigned')}</div>`; card.addEventListener('dragstart',e=>e.dataTransfer.setData('id',l.id)); zones[st]?.appendChild(card); });
 document.querySelector('[data-status="NEW"] h3').innerText=`NEW (${c.NEW})`; document.querySelector('[data-status="CONTACTED"] h3').innerText=`CONTACTED (${c.CONTACTED})`; document.querySelector('[data-status="FOLLOW-UP"] h3').innerText=`FOLLOW-UP (${c['FOLLOW-UP']})`; document.querySelector('[data-status="CLOSED"] h3').innerText=`CLOSED (${c.CLOSED})`;
}
function initDragDrop(){ document.querySelectorAll('.dropzone').forEach(z=>{ z.addEventListener('dragover',e=>e.preventDefault()); z.addEventListener('drop',async e=>{e.preventDefault(); await updateStatus(e.dataTransfer.getData('id'), z.parentElement.dataset.status);});});}
async function assignLead(id,userId){ try{ await request(`${API}/lead/${id}/assign`,{method:'PUT',headers:authHeaders(true),body:JSON.stringify({user_id:userId||null})}); toast(userId?'Lead assigned':'Lead unassigned'); await Promise.all([loadLeads(),loadAnalytics()]); }catch(e){toast(e.message,true);} }
async function updateStatus(id,status){ try{ await request(`${API}/lead/${id}/status`,{method:'PUT',headers:authHeaders(true),body:JSON.stringify({status})}); toast('Status updated'); await Promise.all([loadLeads(),loadAnalytics()]); }catch(e){toast(e.message,true);} }
async function saveNotes(id,notes){ try{ await request(`${API}/lead/${id}/notes`,{method:'PUT',headers:authHeaders(true),body:JSON.stringify({notes})}); toast('Notes saved'); }catch(e){toast(e.message,true);} }
function chartNumber(value) {
    return Number(value || 0);
}

function showChartFallback(canvas, message) {
    if (!canvas) return;
    const box = canvas.closest('.chart-card');
    if (!box) return;
    let fallback = box.querySelector('.chart-fallback');
    if (!fallback) {
        fallback = document.createElement('div');
        fallback.className = 'chart-fallback';
        box.appendChild(fallback);
    }
    fallback.textContent = message;
}

async function loadAnalytics(){
    const d = await request(`${API}/analytics`, { headers: authHeaders() });

    ['total','hot','warm','cold','enquiry','testdrive','closed'].forEach(id => {
        const e = document.getElementById(id);
        if (e) e.innerText = chartNumber(d[id]);
    });

    const c1 = document.getElementById('priorityChart');
    const c2 = document.getElementById('actionChart');

    if (typeof Chart === 'undefined') {
        showChartFallback(c1, 'Chart library not loaded. Check internet/CDN access.');
        showChartFallback(c2, 'Chart library not loaded. Check internet/CDN access.');
        return;
    }

    if (priorityChart) priorityChart.destroy();
    if (actionChart) actionChart.destroy();

    const priorityData = [chartNumber(d.hot), chartNumber(d.warm), chartNumber(d.cold)];
    const actionData = [
        chartNumber(d.enquiry),
        chartNumber(d.testdrive),
        chartNumber(d.call),
        chartNumber(d.whatsapp),
        chartNumber(d.closed),
        chartNumber(d.unassigned)
    ];

    const commonText = '#1f2937';
    const gridColor = 'rgba(31, 41, 55, 0.12)';

    if (c1) {
        priorityChart = new Chart(c1, {
            type: 'doughnut',
            data: {
                labels: ['HOT', 'WARM', 'COLD'],
                datasets: [{
                    data: priorityData,
                    backgroundColor: ['#ef4444', '#f59e0b', '#38bdf8'],
                    borderColor: '#ffffff',
                    borderWidth: 3,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: commonText, usePointStyle: true, padding: 18, font: { weight: '600' } }
                    },
                    tooltip: { enabled: true }
                }
            }
        });
    }

    if (c2) {
        actionChart = new Chart(c2, {
            type: 'bar',
            data: {
                labels: ['Enquiry', 'Test Drive', 'Call', 'WhatsApp', 'Closed', 'Unassigned'],
                datasets: [{
                    label: 'Leads',
                    data: actionData,
                    backgroundColor: ['#2563eb', '#7c3aed', '#f97316', '#22c55e', '#111827', '#94a3b8'],
                    borderRadius: 10,
                    maxBarThickness: 54
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true }
                },
                scales: {
                    x: { ticks: { color: commonText, font: { weight: '600' } }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { color: commonText, precision: 0 }, grid: { color: gridColor } }
                }
            }
        });
    }
}
function renderUsersTable(){ const tb=document.querySelector('#userTable tbody'); if(!tb)return; tb.innerHTML=users.map(u=>`<tr><td>${safe(u.name)}</td><td>${safe(u.email)}</td><td><span class="role-pill">${safe(u.role)}</span></td><td><button onclick="deleteUser(${u.id})" class="delete-user-btn" ${Number(u.id)===Number(user.id)?'disabled':''}>Delete</button></td></tr>`).join(''); }
async function createUser(){ const p={name:document.getElementById('uname').value.trim(),email:document.getElementById('uemail').value.trim(),password:document.getElementById('upassword').value.trim(),role:document.getElementById('urole').value}; if(!p.name||!p.email||!p.password)return toast('All user fields required',true); try{ await request(`${API}/auth/register`,{method:'POST',headers:authHeaders(true),body:JSON.stringify(p)}); ['uname','uemail','upassword'].forEach(id=>document.getElementById(id).value=''); toast('User added'); await loadUsers(); }catch(e){toast(e.message,true);} }
async function deleteUser(id){ if(!confirm('Delete this user? Assigned leads will become unassigned.'))return; try{ await request(`${API}/auth/user/${id}`,{method:'DELETE',headers:authHeaders()}); toast('User deleted'); await Promise.all([loadUsers(),loadLeads(),loadAnalytics()]); }catch(e){toast(e.message,true);} }
function logout(){ sessionStorage.removeItem('token'); sessionStorage.removeItem('user'); window.location.href='login.html'; }
window.onload=async()=>{ document.getElementById('userInfo').innerText=`👤 ${user.name||'Admin'} (${user.role||'admin'})`; initDragDrop(); try{ await loadUsers(); await Promise.all([loadLeads(),loadAnalytics()]); setInterval(()=>Promise.all([loadLeads(),loadAnalytics()]).catch(console.error),50000); }catch(e){toast(e.message,true);} };
