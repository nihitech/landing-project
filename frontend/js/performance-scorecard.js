let myScore = {};
let teamRows = [];
let sourceRows = [];

if (!token) window.location.href = "login.html";

function scoreParams() {
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function loadScorecard() {
  try {
    const params = scoreParams();

    const [me, team, source] = await Promise.all([
      request(`${API}/performance-scorecard/me${params}`, { headers: authHeaders() }),
      request(`${API}/performance-scorecard/team${params}`, { headers: authHeaders() }).catch(() => []),
      request(`${API}/performance-scorecard/source${params}`, { headers: authHeaders() }).catch(() => [])
    ]);

    myScore = me || {};
    teamRows = Array.isArray(team) ? team : [];
    sourceRows = Array.isArray(source) ? source : [];

    renderScorecard();
  } catch (err) {
    toast(err.message || "Failed to load scorecard", true);
  }
}

function renderScorecard() {
  const leads = myScore.leads || {};
  const calls = myScore.calls || {};
  const bookings = myScore.bookings || {};
  const ratios = myScore.ratios || {};

  document.getElementById("mainScore").innerText = myScore.score || 0;
  document.getElementById("scoreRole").innerText = `${safe(myScore.role || "-")} Performance Score`;
  document.getElementById("leadTotal").innerText = leads.total_leads || 0;
  document.getElementById("qualifiedTotal").innerText = leads.qualified_leads || 0;
  document.getElementById("bookingTotal").innerText = bookings.total_bookings || leads.booked_leads || 0;
  document.getElementById("callTotal").innerText = calls.total_calls || 0;
  document.getElementById("missedTotal").innerText = leads.missed_followups || 0;

  document.getElementById("ratioGrid").innerHTML = `
    ${ratio("Conversion", ratios.conversion_score)}
    ${ratio("Follow-up Discipline", ratios.followup_score)}
    ${ratio("Call Performance", ratios.call_score)}
    ${ratio("Allocation", ratios.allocation_score)}
    ${ratio("Query Response", ratios.query_score)}
  `;

  document.getElementById("teamTable").innerHTML = teamRows.map(r => `
    <tr>
      <td><strong>${safe(r.user_name || "-")}</strong></td>
      <td>${safe(r.role || "-")}</td>
      <td>${safe(r.total_leads || 0)}</td>
      <td>${safe(r.booked_leads || 0)}</td>
      <td>${safe(r.completed_calls || 0)}</td>
      <td><strong>${safe(r.performance_score || 0)}</strong></td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="empty-state">Team performance not available for this role.</td></tr>`;

  document.getElementById("sourceList").innerHTML = sourceRows.map(s => `
    <div class="role-task-item">
      <div>
        <strong>${safe(s.source || "UNKNOWN")}</strong>
        <small>Total: ${safe(s.total_leads || 0)} • Qualified: ${safe(s.qualified || 0)} • Booked: ${safe(s.booked || 0)} • Closed: ${safe(s.closed || 0)}</small>
      </div>
    </div>
  `).join("") || `<div class="workspace-empty">No source data.</div>`;
}

function ratio(label, value) {
  const v = Number(value || 0);
  return `<div class="score-ratio"><span>${safe(label)}</span><strong>${v}%</strong><div class="score-bar"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div></div>`;
}

window.loadScorecard = loadScorecard;
window.onload = loadScorecard;
