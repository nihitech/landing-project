
let priorityChart, actionChart;
async function loadPage() {
    const analytics = await request(`${API}/analytics`, { headers: authHeaders() });
    ["total","hot","warm","cold","booked","closed","today_followups","overdue_followups"].forEach(id => { const el=document.getElementById(id); if(el) el.innerText=Number(analytics[id]||0); });
    const leads = await request(`${API}/leads`, { headers: authHeaders() });
    renderTodayFollowups(leads); renderOverdueFollowups(leads); renderNotificationBell(leads);
    if (typeof Chart !== "undefined") {
        if (priorityChart) priorityChart.destroy(); if (actionChart) actionChart.destroy();
        const p=document.getElementById("priorityChart"); if(p) priorityChart=new Chart(p,{type:"doughnut",data:{labels:["HOT","WARM","COLD"],datasets:[{data:[analytics.hot||0,analytics.warm||0,analytics.cold||0],backgroundColor:["#ef4444","#f59e0b","#3b82f6"]}]},options:{responsive:true,maintainAspectRatio:false}});
        const a=document.getElementById("actionChart"); if(a) actionChart=new Chart(a,{type:"bar",data:{labels:["Enquiry","Test Drive","Booked","Closed"],datasets:[{data:[analytics.enquiry||0,analytics.testdrive||0,analytics.booked||0,analytics.closed||0],backgroundColor:["#3b82f6","#06b6d4","#22c55e","#111827"]}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
    }
}
window.onload = () => { loadPage().catch(e=>toast(e.message,true)); setInterval(()=>loadPage().catch(console.error),50000); };
