async function loadFollowups() {
  const leads = await request(`${API}/leads`, { headers: authHeaders() });
  const today = new Date().toISOString().slice(0,10);
  const now = new Date();
  const todayLeads = leads.filter(l => l.next_followup_at && String(l.next_followup_at).slice(0,10) === today && !["CLOSED","LOST"].includes(l.status));
  const overdue = leads.filter(l => l.next_followup_at && new Date(l.next_followup_at) < now && !["CLOSED","LOST"].includes(l.status));
  const card = l => `<div class="overdue-card"><div class="overdue-top"><strong>${safe(l.name)}</strong><span>${safe(l.status)}</span></div><p>${safe(l.phone)}</p><small>${safe(l.car_interest || "Not Selected")}</small><small>${fmtDate(l.next_followup_at)}</small><div class="overdue-actions"><a href="tel:${cleanPhone(l.phone)}">📞 Call</a><a href="https://wa.me/91${cleanPhone(l.phone)}" target="_blank">💬 WhatsApp</a></div></div>`;
  document.getElementById("todayFollowups").innerHTML = todayLeads.length ? todayLeads.map(card).join("") : `<div class="empty-state">No follow-ups today</div>`;
  document.getElementById("overdueFollowups").innerHTML = overdue.length ? overdue.map(card).join("") : `<div class="empty-state">No missed follow-ups</div>`;
}
window.onload = () => loadFollowups().catch(console.error);
