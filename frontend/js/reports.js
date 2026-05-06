async function loadReport(type = "daily") {
  const leads = await request(`${API}/leads`, { headers: authHeaders() });
  const analytics = await request(`${API}/analytics`, { headers: authHeaders() });
  const now = new Date();
  const start = new Date(now);
  if (type === "daily") start.setHours(0,0,0,0);
  if (type === "weekly") start.setDate(now.getDate() - 7);
  if (type === "monthly") start.setMonth(now.getMonth() - 1);
  const period = leads.filter(l => l.created_at && new Date(l.created_at) >= start);
  const followupsDue = leads.filter(l => l.next_followup_at && new Date(l.next_followup_at) <= now && !["CLOSED","LOST"].includes(l.status));
  const byUser = {};
  period.forEach(l => {
    const name = l.assigned_name || "Unassigned";
    byUser[name] = byUser[name] || { total:0, hot:0, booked:0, closed:0, overdue:0 };
    byUser[name].total++;
    if (l.priority === "HOT") byUser[name].hot++;
    if (l.status === "BOOKED") byUser[name].booked++;
    if (l.status === "CLOSED") byUser[name].closed++;
  });
  followupsDue.forEach(l => {
    const name = l.assigned_name || "Unassigned";
    byUser[name] = byUser[name] || { total:0, hot:0, booked:0, closed:0, overdue:0 };
    byUser[name].overdue++;
  });
  const reportText = `${type.toUpperCase()} CRM REPORT\n\nTotal Leads: ${period.length}\nHot: ${period.filter(l=>l.priority==='HOT').length}\nWarm: ${period.filter(l=>l.priority==='WARM').length}\nCold: ${period.filter(l=>l.priority==='COLD').length}\nBooked: ${period.filter(l=>l.status==='BOOKED').length}\nClosed: ${period.filter(l=>l.status==='CLOSED').length}\nOverdue Follow-ups: ${followupsDue.length}\n\nUser-wise Performance:\n${Object.entries(byUser).map(([n,s])=>`${n}: Leads ${s.total}, Hot ${s.hot}, Booked ${s.booked}, Closed ${s.closed}, Missed ${s.overdue}`).join("\n") || "No user data"}`;
  document.getElementById("reportOutput").textContent = reportText;
}
function copyReport() {
  navigator.clipboard.writeText(document.getElementById("reportOutput").textContent || "");
  alert("Report copied");
}
function downloadReport() {
  const text = document.getElementById("reportOutput").textContent || "";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `crm-report-${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}
window.onload = () => loadReport("daily").catch(console.error);
