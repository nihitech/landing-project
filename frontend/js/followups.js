
let allLeads=[];
async function loadPage(){ allLeads=await request(`${API}/leads`,{headers:authHeaders()}); renderTodayFollowups(allLeads); renderOverdueFollowups(allLeads); renderNotificationBell(allLeads); }
window.onload=()=>{ loadPage().catch(e=>toast(e.message,true)); setInterval(()=>loadPage().catch(console.error),50000); };
