async function loadAnalyticsPage() {
  const a = await request(`${API}/analytics`, { headers: authHeaders() });
  ["total","hot","warm","cold","enquiry","testdrive","booked","closed","today_followups","overdue_followups"].forEach(id => { const el=document.getElementById(id); if(el) el.innerText=a[id]||0; });
  const box=document.getElementById("sourceBreakdown");
  if(box) box.innerHTML=(a.by_source||[]).map(s=>`<div class="dash-card">${safe(s.source)} <span>${s.count}</span></div>`).join("") || `<div class="empty-state">No source data</div>`;
}
window.onload = () => loadAnalyticsPage().catch(console.error);
