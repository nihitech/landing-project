let allocationBookings=[];
let selectedBooking=null;
let availableInventory=[];

if(!token) window.location.href="login.html";

async function loadAllocationQueue(){
  try{
    allocationBookings = await request(`${API}/bookings/pending-allocation`,{headers:authHeaders()});
    if(!Array.isArray(allocationBookings)) allocationBookings=[];
    renderAllocationQueue();
  }catch(err){
    toast(err.message || "Failed to load allocation queue", true);
  }
}

function renderAllocationQueue(){
  document.getElementById("pendingCount").innerText=allocationBookings.length;
  const box=document.getElementById("bookingQueue");

  box.innerHTML=allocationBookings.map(b=>`
    <div class="role-task-item">
      <div>
        <strong>${safe(b.customer_name || "Customer")}</strong>
        <small>${safe(b.customer_phone || "")} • ${safe(b.booking_no || "")}</small>
        <small>${safe(b.vehicle_category || "")} • ${safe(b.car_interest || "")} • ${safe(b.variant_interest || "")} • ${safe(b.preferred_color || "")}</small>
        <small>Sales: ${safe(b.sales_person_name || "-")} • ${fmtDate(b.created_at)}</small>
      </div>
      <div class="role-task-actions">
        <button onclick="loadAvailableInventory(${b.id})" class="save-btn">Find Vehicles</button>
        <a href="customer-timeline.html?lead=${b.lead_id}" class="copy-btn">Timeline</a>
      </div>
    </div>
  `).join("") || `<div class="workspace-empty">No pending allocation bookings.</div>`;
}

async function loadAvailableInventory(bookingId){
  selectedBooking = allocationBookings.find(b=>Number(b.id)===Number(bookingId));
  if(!selectedBooking) return;

  document.getElementById("selectedBookingText").innerText =
    `${selectedBooking.customer_name || "Customer"} • ${selectedBooking.car_interest || ""} ${selectedBooking.variant_interest || ""}`;

  try{
    availableInventory = await request(`${API}/bookings/${bookingId}/available-inventory`,{headers:authHeaders()});
    if(!Array.isArray(availableInventory)) availableInventory=[];
    renderInventoryOptions();
  }catch(err){
    toast(err.message || "Failed to load inventory", true);
  }
}

function renderInventoryOptions(){
  document.getElementById("inventoryCount").innerText=availableInventory.length;
  const box=document.getElementById("inventoryOptions");

  box.innerHTML=availableInventory.map(i=>`
    <div class="role-task-item">
      <div>
        <strong>${safe(i.vin_number || i.chassis_number || "Vehicle")}</strong>
        <small>${safe(i.model_name || "")} • ${safe(i.variant_name || "")} • ${safe(i.color_name || "")}</small>
        <small>Status: ${safe(i.vehicle_status || "AVAILABLE")} • Location: ${safe(i.current_location || i.location || "-")}</small>
      </div>
      <div class="role-task-actions">
        <button onclick="allocateVehicle(${i.id})" class="save-btn">Allocate</button>
      </div>
    </div>
  `).join("") || `<div class="workspace-empty">No matching available vehicle found.</div>`;
}

async function allocateVehicle(inventoryId){
  if(!selectedBooking) return toast("Select booking first", true);
  if(!confirm("Allocate this vehicle to selected booking?")) return;

  try{
    await request(`${API}/bookings/${selectedBooking.id}/allocate-inventory`,{
      method:"POST",
      headers:authHeaders(true),
      body:JSON.stringify({inventory_id:inventoryId})
    });

    toast("Vehicle allocated successfully");
    selectedBooking=null;
    availableInventory=[];
    document.getElementById("selectedBookingText").innerText="Select a booking first.";
    document.getElementById("inventoryOptions").innerHTML="";
    await loadAllocationQueue();
  }catch(err){
    toast(err.message || "Allocation failed", true);
  }
}

window.loadAllocationQueue=loadAllocationQueue;
window.loadAvailableInventory=loadAvailableInventory;
window.allocateVehicle=allocateVehicle;
window.onload=loadAllocationQueue;
