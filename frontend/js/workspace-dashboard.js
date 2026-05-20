if(!token){window.location.href="login.html";}
function setText(id,v){const e=document.getElementById(id);if(e)e.innerText=v??"0";}
async function safeReq(url,fallback){try{return await request(url,{headers:authHeaders()});}catch(e){console.warn(url,e.message);return fallback;}}
async function loadWorkspace(roleKey){
 const [summary,leads,qrSubs,fieldActs]=await Promise.all([
  safeReq(`${API}/dashboard/summary`,{}),
  safeReq(`${API}/leads`,[]),
  safeReq(`${API}/showroom-qr/submissions`,[]),
  safeReq(`${API}/field-activities`,[])
 ]);
 const leadRows=Array.isArray(leads)?leads:(leads.leads||leads.data||[]);
 const today=new Date().toISOString().slice(0,10);
 const myId=user?.id;
 const myLeads=leadRows.filter(l=>!myId||Number(l.assigned_to)===Number(myId));
 const todayFollowups=myLeads.filter(l=>String(l.next_followup_at||l.next_followup_date||"").slice(0,10)===today);
 const overdue=myLeads.filter(l=>{const d=l.next_followup_at||l.next_followup_date;if(!d)return false;return new Date(d)<new Date()&&!["CLOSED","LOST"].includes(String(l.status||"").toUpperCase());});
 const pendingQr=(qrSubs||[]).filter(q=>!q.lead_id&&["SUBMITTED","REVIEWED"].includes(String(q.submission_status||"").toUpperCase()));
 const activities=(fieldActs||[]).filter(a=>["ACTIVE","PLANNED"].includes(String(a.status||"").toUpperCase()));
 setText("kpiLeads",myLeads.length||summary.total||0);setText("kpiToday",summary.today||0);setText("kpiFollowups",todayFollowups.length||summary.today_followups||0);setText("kpiOverdue",overdue.length||summary.overdue_followups||0);setText("kpiQr",pendingQr.length);setText("kpiActivities",activities.length);
 renderQueue("primaryQueue",buildQueue(roleKey,{myLeads,todayFollowups,overdue,pendingQr,activities,summary}));
}
function buildQueue(roleKey,c){
 if(roleKey==="receptionist")return [{title:"Create / Display Today QR",meta:"Showroom walk-in flow",action:"Open",url:"showroom-qr-admin.html"},...c.pendingQr.slice(0,8).map(q=>({title:q.customer_name,meta:`QR submission • ${q.phone}`,action:"Review",url:"showroom-qr-admin.html"}))];
 if(roleKey==="telecaller")return c.pendingQr.slice(0,10).map(q=>({title:q.customer_name,meta:`Pending validation • ${q.phone}`,action:"Validate",url:"showroom-qr-admin.html"}));
 if(roleKey==="manager")return [{title:"Missed Follow-ups",meta:`${c.summary.overdue_followups||c.overdue.length||0} overdue`,action:"Review",url:"leads.html"},{title:"Field Activities",meta:`${c.activities.length} active/planned`,action:"Monitor",url:"field-activities.html"},{title:"Activity Intelligence",meta:"Audit monitoring",action:"Open",url:"activity.html"}];
 if(roleKey==="field")return c.activities.slice(0,10).map(a=>({title:a.activity_name,meta:`${a.location_name||"-"} • ${a.status}`,action:"Check-in",url:"field-activities.html"}));
 if(roleKey==="sales")return [...c.todayFollowups.slice(0,6).map(l=>({title:l.name||l.customer_name,meta:`Follow-up today • ${l.phone}`,action:"Open",url:"leads.html"})),...c.overdue.slice(0,4).map(l=>({title:l.name||l.customer_name,meta:`Overdue • ${l.phone}`,action:"Open",url:"leads.html"}))];
 return [{title:"Operational Control Center",meta:"Enterprise dashboard",action:"Open",url:"dashboard.html"}];
}
function renderQueue(id,rows){const box=document.getElementById(id);if(!box)return;if(!rows.length){box.innerHTML=`<div class="workspace-empty">No pending operational tasks.</div>`;return;}box.innerHTML=rows.map(r=>`<div class="workspace-task"><div><strong>${safe(r.title||"-")}</strong><small>${safe(r.meta||"")}</small></div><a href="${r.url||"#"}">${safe(r.action||"Open")}</a></div>`).join("");}
window.loadWorkspace=loadWorkspace;
