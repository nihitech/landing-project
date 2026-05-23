/*
  NIKRION Process Action Engine v1 Frontend Helper
*/

async function processMoveLead(leadId, status, remarks = "") {
  return request(`${API}/process-actions/lead/${leadId}/status`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ status, remarks })
  });
}

async function processUpdateFollowup(leadId, payload) {
  return request(`${API}/process-actions/lead/${leadId}/followup`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload || {})
  });
}

async function processRequestBooking(leadId, remarks = "") {
  return request(`${API}/process-actions/lead/${leadId}/request-booking`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ remarks })
  });
}

async function processRaiseQuery(payload) {
  return request(`${API}/process-actions/queries`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload || {})
  });
}

async function processAnswerQuery(queryId, answer) {
  return request(`${API}/process-actions/queries/${queryId}/answer`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ answer })
  });
}

function processLeadActionButtons(lead) {
  const id = Number(lead.id);
  return `
    <div class="process-action-buttons">
      <button onclick="openProcessFollowup(${id})" class="copy-btn">Follow-up</button>
      <button onclick="quickProcessMove(${id}, 'TEST-DRIVE')" class="copy-btn">Test Drive</button>
      <button onclick="quickProcessBooking(${id})" class="save-btn">Booking</button>
      <button onclick="openProcessQuery(${id})" class="copy-btn">Ask Manager</button>
    </div>
  `;
}

async function quickProcessMove(leadId, status) {
  const remarks = prompt(`Remarks for ${status}`) || "";
  try {
    await processMoveLead(leadId, status, remarks);
    toast(`Lead moved to ${status}`);
    if (typeof loadWorkspaceEngine === "function") await loadWorkspaceEngine();
  } catch (err) {
    toast(err.message || "Action failed", true);
  }
}

async function quickProcessBooking(leadId) {
  const remarks = prompt("Booking request remarks") || "";
  try {
    await processRequestBooking(leadId, remarks);
    toast("Booking request created");
    if (typeof loadWorkspaceEngine === "function") await loadWorkspaceEngine();
  } catch (err) {
    toast(err.message || "Booking request failed", true);
  }
}

async function openProcessFollowup(leadId) {
  const response = prompt("Customer response / call status") || "";
  const nextDate = prompt("Next follow-up date/time (YYYY-MM-DD HH:mm) or leave blank") || "";
  const remarks = prompt("Follow-up remarks") || "";

  try {
    await processUpdateFollowup(leadId, {
      customer_response: response,
      next_followup_at: nextDate,
      remarks
    });
    toast("Follow-up updated");
    if (typeof loadWorkspaceEngine === "function") await loadWorkspaceEngine();
  } catch (err) {
    toast(err.message || "Follow-up update failed", true);
  }
}

async function openProcessQuery(leadId) {
  const title = prompt("Query title / doubt") || "";
  if (!title.trim()) return toast("Query title required", true);

  const message = prompt("Explain your query to manager") || "";
  if (!message.trim()) return toast("Query message required", true);

  try {
    await processRaiseQuery({
      lead_id: leadId,
      title,
      message,
      query_type: "SALES_QUERY",
      priority: "NORMAL"
    });
    toast("Query raised to higher authority");
  } catch (err) {
    toast(err.message || "Failed to raise query", true);
  }
}

window.processMoveLead = processMoveLead;
window.processUpdateFollowup = processUpdateFollowup;
window.processRequestBooking = processRequestBooking;
window.processRaiseQuery = processRaiseQuery;
window.processAnswerQuery = processAnswerQuery;
window.processLeadActionButtons = processLeadActionButtons;
window.quickProcessMove = quickProcessMove;
window.quickProcessBooking = quickProcessBooking;
window.openProcessFollowup = openProcessFollowup;
window.openProcessQuery = openProcessQuery;


async function answerProcessQuery(queryId) {
  const answer = prompt("Answer / guidance for salesperson");
  if (!answer || !answer.trim()) return toast("Answer is required", true);

  try {
    await processAnswerQuery(queryId, answer);
    toast("Query answered");
    if (typeof loadWorkspaceEngine === "function") await loadWorkspaceEngine();
  } catch (err) {
    toast(err.message || "Failed to answer query", true);
  }
}

async function openManagerReassign(leadId) {
  const userId = prompt("Enter salesperson user ID to reassign this lead");
  if (!userId) return;

  try {
    await request(`${API}/leads/${leadId}/assign`, {
      method: "PUT",
      headers: authHeaders(true),
      body: JSON.stringify({ assigned_to: Number(userId) })
    });
    toast("Lead reassigned");
    if (typeof loadWorkspaceEngine === "function") await loadWorkspaceEngine();
  } catch (err) {
    toast(err.message || "Reassign failed", true);
  }
}

window.answerProcessQuery = answerProcessQuery;
window.openManagerReassign = openManagerReassign;
