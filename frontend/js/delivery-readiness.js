let readinessRows=[];

if(!token) window.location.href="login.html";

async function loadReadinessQueue(){
  try{
    readinessRows = await request(`${API}/delivery/readiness-queue`,{headers:authHeaders()});
    if(!Array.isArray(readinessRows)) readinessRows=[];
    renderReadinessQueue();
  }catch(err){
    toast(err.message || "Failed to load delivery readiness", true);
  }
}

function renderReadinessQueue(){
  document.getElementById("totalCount").innerText=readinessRows.length;
  document.getElementById("readyCount").innerText=readinessRows.filter(r=>r.delivery_status==="READY").length;
  document.getElementById("blockedCount").innerText=readinessRows.filter(r=>r.delivery_status==="BLOCKED").length;
  document.getElementById("deliveredCount").innerText=readinessRows.filter(r=>r.actual_delivery_date).length;

  const box=document.getElementById("readinessQueue");
  box.innerHTML=readinessRows.map(row=>`
    <div class="delivery-readiness-card">
      <div class="readiness-head">
        <div>
          <strong>${safe(row.customer_name || "Customer")}</strong>
          <small>${safe(row.customer_phone || "")} • ${safe(row.booking_no || "")}</small>
          <small>${safe(row.model_name || "")} • ${safe(row.variant_name || "")} • VIN: ${safe(row.vin_number || row.chassis_number || "-")}</small>
          <small>Vehicle: ${safe(row.vehicle_status || "-")} • Delivery: ${safe(row.delivery_status || "PENDING")} • Score: ${safe(row.delivery_ready_score || 0)}%</small>
        </div>
        <div class="role-task-actions">
          <a href="customer-timeline.html?lead=${row.lead_id}" class="copy-btn">Timeline</a>
          <button onclick="openChecklist(${row.booking_id})" class="save-btn">Update Checklist</button>
        </div>
      </div>
      <div class="readiness-progress">
        ${pill("PDI", row.pdi_completed)}
        ${pill("Accessories", row.accessories_completed)}
        ${pill("Finance", row.finance_completed)}
        ${pill("Insurance", row.insurance_completed)}
        ${pill("RTO", row.rto_completed)}
        ${pill("FASTag", row.fastag_completed)}
        ${pill("Payment", row.payment_completed)}
        ${pill("Invoice", row.invoice_completed)}
        ${pill("Customer OK", row.customer_confirmation)}
      </div>
      ${row.blocker_reason ? `<div class="blocker-note">Blocker: ${safe(row.blocker_reason)}</div>` : ""}
    </div>
  `).join("") || `<div class="workspace-empty">No allocated bookings waiting for delivery readiness.</div>`;
}

function pill(label, done){
  return `<span class="readiness-pill ${done ? "done" : ""}">${safe(label)}: ${done ? "Done" : "Pending"}</span>`;
}

async function openChecklist(bookingId){
  const yn = (label) => confirm(`${label} completed?`);
  const payload = {
    pdi_completed: yn("PDI"),
    accessories_completed: yn("Accessories"),
    finance_completed: yn("Finance"),
    insurance_completed: yn("Insurance"),
    rto_completed: yn("RTO"),
    fastag_completed: yn("FASTag"),
    payment_completed: yn("Payment"),
    invoice_completed: yn("Invoice"),
    customer_confirmation: yn("Customer confirmation"),
    planned_delivery_date: prompt("Planned delivery date (YYYY-MM-DD) or blank") || "",
    actual_delivery_date: prompt("Actual delivery date if delivered (YYYY-MM-DD) or blank") || "",
    blocker_reason: prompt("Blocker reason if any") || "",
    remarks: prompt("Remarks") || ""
  };

  try{
    await request(`${API}/delivery/booking/${bookingId}/readiness`,{
      method:"POST",
      headers:authHeaders(true),
      body:JSON.stringify(payload)
    });
    toast("Delivery readiness updated");
    await loadReadinessQueue();
  }catch(err){
    toast(err.message || "Failed to update readiness", true);
  }
}

window.loadReadinessQueue=loadReadinessQueue;
window.openChecklist=openChecklist;
window.onload=loadReadinessQueue;
