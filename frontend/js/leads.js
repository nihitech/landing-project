
let users = [], allLeads = [];
let vehicleModels = [];
let vehicleVariants = [];
let vehicleColors = [];
async function loadUsers() {
    if (user.role !== "admin") return;
    users = await request(`${API}/auth/users`, { headers: authHeaders() });
}

async function loadVehicleMasters() {
    try {
        const [models, variants, colors] = await Promise.all([
            request(`${API}/vehicles/models`, {
                headers: authHeaders()
            }),

            request(`${API}/vehicles/variants`, {
                headers: authHeaders()
            }),

            request(`${API}/vehicles/colors`, {
                headers: authHeaders()
            })
        ]);

        vehicleModels = models || [];
        vehicleVariants = variants || [];
        vehicleColors = colors || [];

    } catch (err) {
        console.error("Vehicle master load failed:", err.message);
    }
}

function loadVehicleModels() {
    const category = document.getElementById("e_vehicle_category")?.value;
    const modelSelect = document.getElementById("e_car");

    if (!modelSelect) return;

    const filtered = category
        ? vehicleModels.filter(
            m => String(m.vehicle_category || "") === String(category)
        )
        : vehicleModels;

    modelSelect.innerHTML =
        `<option value="">Select Model</option>` +
        filtered.map(model => `
            <option value="${model.model_name}">
                ${model.model_name}
            </option>
        `).join("");
        const fuelSelect = document.getElementById("e_fuel_type");
        if (fuelSelect) {
            fuelSelect.innerHTML = `<option value="">Select Fuel Type</option>`;
        }
}

function loadVehicleVariants() {
    const model = document.getElementById("e_car")?.value;
    const variantSelect = document.getElementById("e_variant");

    if (!variantSelect) return;

    variantSelect.innerHTML =
        `<option value="">Select Variant</option>`;

    if (!model) return;

    const selectedModel = vehicleModels.find(
        m => String(m.model_name) === String(model)
    );

    if (!selectedModel) return;

    const fuelSelect = document.getElementById("e_fuel_type");
if (fuelSelect) {
    const fuelTypes = [
        selectedModel.fuel_type,
        ...vehicleVariants
            .filter(v => Number(v.model_id) === Number(selectedModel.id))
            .map(v => v.fuel_type)
    ]
        .filter(Boolean)
        .map(v => String(v).trim())
        .filter((v, i, arr) => arr.indexOf(v) === i);

    fuelSelect.innerHTML =
        `<option value="">Select Fuel Type</option>` +
        fuelTypes.map(fuel => `
            <option value="${fuel}">
                ${fuel}
            </option>
        `).join("");
}

    const filteredVariants = vehicleVariants.filter(
        v => Number(v.model_id) === Number(selectedModel.id)
    );

    variantSelect.innerHTML += filteredVariants.map(variant => `
        <option value="${variant.variant_name}">
            ${variant.variant_name}
        </option>
    `).join("");
}

function loadVehicleColors() {
    const model = document.getElementById("e_car")?.value;
    const colorSelect = document.getElementById("e_color");

    if (!colorSelect) return;

    colorSelect.innerHTML =
        `<option value="">Select Color</option>`;

    if (!model) return;

    const selectedModel = vehicleModels.find(
        m => String(m.model_name) === String(model)
    );

    if (!selectedModel) return;

    const filteredColors = vehicleColors.filter(
        c => Number(c.model_id) === Number(selectedModel.id)
    );

    colorSelect.innerHTML += filteredColors.map(color => `
        <option value="${color.color_name}">
            ${color.color_name}
        </option>
    `).join("");
}

async function checkLeadStockAvailability() {
    const model = document.getElementById("e_car")?.value || "";
    const variant = document.getElementById("e_variant")?.value || "";
    const color = document.getElementById("e_color")?.value || "";
    const box = document.getElementById("stockAvailabilityBox");

    if (!box) return;

    if (!model) {
        box.innerHTML = "Select model, variant and color to check availability.";
        return;
    }

    const search = [model, variant, color].filter(Boolean).join(" ");

    box.innerHTML = "Checking stock availability...";

    try {
        const data = await request(
            `${API}/stock/availability/search?search=${encodeURIComponent(search)}`,
            { headers: authHeaders() }
        );

        if (!data.length) {
            box.innerHTML = `
                <div class="stock-alert warning">
                    ⚠ No matching stock found. Check alternative model/color or waiting period.
                </div>
            `;
            return;
        }

        box.innerHTML = data.slice(0, 5).map(row => `
            <div class="stock-mini-card">
                <strong>${safe(row.model_name)} - ${safe(row.variant_name || "-")}</strong>
                <small>Color: ${safe(row.color_name || "-")} | Branch: ${safe(row.branch_name || "-")}</small>
                <small>Status: ${safe(row.stock_status || "-")}</small>
                <small>
                    Available: ${Number(row.available_quantity || 0)} |
                    Transit: ${Number(row.in_transit_quantity || 0)} |
                    Billing Soon: ${Number(row.billing_soon_quantity || 0)}
                </small>
                <small>
                    Waiting: ${Number(row.waiting_period_days || 0)} days |
                    Arrival: ${row.expected_arrival_date ? new Date(row.expected_arrival_date).toLocaleDateString("en-IN") : "-"}
                </small>
                <small>${safe(row.remarks || "")}</small>
            </div>
        `).join("");

    } catch (err) {
        box.innerHTML = `
            <div class="stock-alert danger">
                Stock availability check failed.
            </div>
        `;
    }
}

function syncFuelTypeFromVariant() {
    const model = document.getElementById("e_car")?.value;
    const variant = document.getElementById("e_variant")?.value;
    const fuelSelect = document.getElementById("e_fuel_type");

    if (!model || !variant || !fuelSelect) return;

    const selectedModel = vehicleModels.find(
        m => String(m.model_name) === String(model)
    );

    if (!selectedModel) return;

    const selectedVariant = vehicleVariants.find(
        v =>
            Number(v.model_id) === Number(selectedModel.id) &&
            String(v.variant_name) === String(variant)
    );

    if (selectedVariant?.fuel_type) {
        fuelSelect.value = selectedVariant.fuel_type;
    }
}

async function loadBranches() {
    if (user.role !== "admin") return;

    const branchSelect = document.getElementById("branchFilter");
    if (!branchSelect) return;

    try {
        const branches = await request(`${API}/branches`, {
            headers: authHeaders()
        });

        branchSelect.innerHTML = `<option value="">All Branches</option>` +
            branches.map(branch => `
                <option value="${branch.id}">
                    ${safe(branch.branch_name)} ${branch.branch_code ? `(${safe(branch.branch_code)})` : ""}
                </option>
            `).join("");

    } catch (err) {
        console.error("Load branches failed:", err.message);
    }
}

async function loadPage() {
    const params = new URLSearchParams();
const priority = document.getElementById("filter")?.value || "";
const source = document.getElementById("sourceFilter")?.value || "";
const branchId = document.getElementById("branchFilter")?.value || "";
const search = document.getElementById("searchInput")?.value.trim() || "";    
if (priority) params.set("priority", priority);
if (source) params.set("source", source);
if (branchId) params.set("branch_id", branchId);
if (search) params.set("search", search);
    allLeads = await request(`${API}/leads${params.toString()?`?${params}`:""}`, { headers: authHeaders() });
    renderPipeline(allLeads); renderTable(allLeads); renderNotificationBell(allLeads);
}
function renderPipeline(leads) {
    const counters = Object.fromEntries(STATUSES.map(s => [s,0]));
    STATUSES.forEach(s => { const z=document.getElementById(ZONE_IDS[s]); if(z) z.innerHTML=""; });
    leads.forEach(l => { const st = STATUSES.includes(l.status) ? l.status : "NEW"; counters[st]++; const z=document.getElementById(ZONE_IDS[st]); if(!z) return; const card=document.createElement("div"); card.className=`lead-card ${String(l.priority||"COLD").toLowerCase()}`; card.draggable=true; card.dataset.id=l.id; card.innerHTML=`<strong>${safe(l.name)}</strong><div class="lead-meta">${safe(l.phone)} • ${safe(l.car_interest||"Not Selected")}</div><div class="lead-meta">${safe(l.source||"WEBSITE")} • ${safe(l.assigned_name||"Unassigned")}</div>`; card.addEventListener("dragstart",e=>e.dataTransfer.setData("id",l.id)); z.appendChild(card); });
    STATUSES.forEach(s => { const h=document.querySelector(`[data-status="${s}"] h3`); if(h) h.innerText=`${s} (${counters[s]})`; });
}
function initDragDrop() { document.querySelectorAll(".dropzone").forEach(z => { z.addEventListener("dragover",e=>e.preventDefault()); z.addEventListener("drop", async e => { e.preventDefault(); await updateStatus(e.dataTransfer.getData("id"), z.parentElement.dataset.status); }); }); }
function renderTable(leads) {
    const tb=document.querySelector("#leadTable tbody"); if(!tb) return;
    if(!leads.length){ tb.innerHTML=`<tr><td colspan="9" class="empty-state">No leads found</td></tr>`; return; }
    tb.innerHTML = leads.map(lead => { const pc=String(lead.priority||"COLD").toLowerCase(); const phone=cleanPhone(lead.phone); const assign = user.role === "admin" ? `<select onchange="assignLead(${lead.id},this.value)"><option value="">Unassigned</option>${users.filter(u=>u.role==='sales').map(u=>`<option value="${u.id}" ${Number(lead.assigned_to)===Number(u.id)?"selected":""}>${safe(u.name)}</option>`).join("")}</select>` : safe(lead.assigned_name||"Unassigned"); return `<tr class="${pc}"><td><strong>${safe(lead.name)}</strong><small>${fmtDate(lead.created_at)}</small><small>Family: ${safe(lead.family_members||"-")}</small></td><td>${safe(lead.phone)}<small>Alt: ${safe(lead.alternate_phone||"-")}</small><small>${safe(lead.area||"")} ${safe(lead.district||"")}</small></td><td>${safe(lead.vehicle_category||"-")} / ${safe(lead.fuel_type||"-")}<small>${safe(lead.car_interest||"Not Selected")}</small><small>Variant: ${safe(lead.variant_interest || "-")}</small>
<small>Color: ${safe(lead.preferred_color || "-")}</small></td><td>${safe(lead.source||"WEBSITE")}<small>${safe(lead.action_type||lead.lead_type||"ENQUIRY")}</small><small>${safe(lead.campaign_name||"-")}</small></td><td><span class="badge ${pc}">${safe(lead.priority||"COLD")}</span><small>Score: ${Number(lead.score||0)}</small></td><td><select onchange="updateStatus(${lead.id},this.value)">${STATUSES.map(s=>`<option value="${s}" ${lead.status===s?"selected":""}>${s}</option>`).join("")}</select></td><td class="admin-only">${assign}</td><td><button onclick="openFollowup(${lead.id})" class="followup-btn">📞 Follow-up</button><small>Next: ${fmtDate(lead.next_followup_at)}</small><small>Count: ${lead.followup_count||0}</small></td>
<td class="actions compact-actions">

<button 
    onclick="openLeadDetails(${lead.id})"
    class="icon-btn view-btn"
    title="View Details"
>
    👁
</button>

<button 
    onclick="openFollowup(${lead.id})"
    class="icon-btn followup-btn"
    title="Add Follow-up"
>
    📞
</button>

<button 
    onclick="openOtpModal(${lead.id})"
    class="icon-btn verify-btn"
    title="OTP Verification"
>
    🔐
</button>

<button 
    onclick="openEnquiryModal(${lead.id})"
    class="icon-btn enquiry-btn"
    title="Detailed Enquiry"
>
    📝
</button>

<a 
    href="tel:${phone}"
    class="icon-link"
    title="Call Customer"
>
    📲
</a>

<a 
    href="https://wa.me/91${phone}"
    target="_blank"
    class="icon-link whatsapp"
    title="WhatsApp Customer"
>
    💬
</a>

</td>
</tr>`; }).join("");
    if(user.role !== "admin") document.querySelectorAll(".admin-only").forEach(e=>e.style.display="none");
}
async function assignLead(id,userId){ try{ await request(`${API}/lead/${id}/assign`,{method:"PUT",headers:authHeaders(true),body:JSON.stringify({user_id:userId||null})}); toast(userId?"Lead assigned":"Lead unassigned"); await loadPage(); }catch(e){toast(e.message,true);} }
async function updateStatus(id, status) {
    try {
        const payload = { status };

        if (status === "LOST") {
            const lostReason = prompt(
                "Why was this lead lost?\n\nExample: Price high / customer not interested / finance issue"
            );

            if (lostReason === null) {
                toast("Status update cancelled");
                await loadPage();
                return;
            }

            const competitorModel = prompt(
                "Competitor model / showroom name, if any?\n\nExample: Tata Nexon / Hyundai Creta / Other showroom"
            );

            payload.lost_reason = lostReason.trim();
            payload.competitor_model = competitorModel ? competitorModel.trim() : "";
        }

        await request(`${API}/lead/${id}/status`, {
            method: "PUT",
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast("Status updated");
        await loadPage();

    } catch (e) {
        toast(e.message, true);
        await loadPage();
    }
}

async function escalateFollowups(){ if(user.role!=="admin")return; if(!confirm("Escalate missed follow-ups?"))return; try{ const r=await request(`${API}/followups/escalate`,{method:"POST",headers:authHeaders()}); toast(`${r.updated||0} leads escalated`); await loadPage(); }catch(e){toast(e.message,true);} }
function downloadLeadsCSV(){ if(!allLeads.length)return toast("No leads to download",true); const headers=["Name","Phone","Car","Variant","Source","Priority","Status","Assigned","Next Follow-up","Created"]; const rows=allLeads.map(l=>[l.name,l.phone,l.car_interest,l.variant_interest,l.source,l.priority,l.status,l.assigned_name||"Unassigned",l.next_followup_at,l.created_at]); const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n"); const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download=`leads-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href); }
async function openLeadDetails(id) {
    const lead = allLeads.find(l => Number(l.id) === Number(id));

    if (!lead) {
        return toast("Lead not found", true);
    }

    let followups = [];

    try {
        followups = await request(`${API}/lead/${id}/followups`, {
            headers: authHeaders()
        });
    } catch (e) {
        followups = [];
    }

    document.getElementById("leadDetailContent").innerHTML = `
        <div class="detail-grid">
            <div>
                <strong>Name</strong>
                <span>${safe(lead.name)}</span>
            </div>

            <div>
                <strong>Phone</strong>
                <span>${safe(lead.phone)}</span>
            </div>

            <div>
                <strong>Alt Phone</strong>
                <span>${safe(lead.alternate_phone || "-")}</span>
            </div>

            <div>
                <strong>Email</strong>
                <span>${safe(lead.email || "-")}</span>
            </div>

            <div>
                <strong>Area</strong>
                <span>${safe(lead.area || "-")}</span>
            </div>

            <div>
                <strong>District</strong>
                <span>${safe(lead.district || "-")}</span>
            </div>

            <div>
                <strong>Profession</strong>
                <span>${safe(lead.profession || "-")}</span>
            </div>

            <div>
                <strong>Family</strong>
                <span>${safe(lead.family_members || "-")}</span>
            </div>

            <div>
                <strong>Category / Fuel</strong>
                <span>${safe(lead.vehicle_category || "-")} / ${safe(lead.fuel_type || "-")}</span>
            </div>

            <div>
                <strong>Model / Variant</strong>
                <span>${safe(lead.car_interest || "-")} / ${safe(lead.variant_interest || "-")}</span>
            </div>

            <div>
                <strong>Preferred Color</strong>
                <span>${safe(lead.preferred_color || "-")}</span>
            </div>

            <div>
                <strong>Verification</strong>
                <span>${safe(lead.verification_status || "NOT_VERIFIED")}</span>
            </div>

            <div>
                <strong>Verified At</strong>
                <span>${fmtDate(lead.verified_at)}</span>
            </div>

            <div>
                <strong>Budget</strong>
                <span>${safe(lead.budget_range || "-")}</span>
            </div>

            <div>
                <strong>Timeline</strong>
                <span>${safe(lead.purchase_timeline || "-")}</span>
            </div>

            <div>
                <strong>Exchange</strong>
                <span>${safe(lead.exchange_vehicle || "-")}</span>
            </div>

            <div>
                <strong>Finance</strong>
                <span>${safe(lead.finance_required || "-")}</span>
            </div>

            <div>
                <strong>Test Drive</strong>
                <span>${fmtDate(lead.test_drive_date)}</span>
            </div>

            <div>
                <strong>Visit</strong>
                <span>${fmtDate(lead.showroom_visit_date)}</span>
            </div>

            <div>
                <strong>Booking Expected</strong>
                <span>${fmtDate(lead.booking_expected_date)}</span>
            </div>

            <div>
                <strong>Assigned</strong>
                <span>${safe(lead.assigned_name || "Unassigned")}</span>
            </div>

            <div class="detail-text-row">
                <strong>Lost Reason:</strong>
                <span>${safe(lead.lost_reason || "-")}</span>
            </div>

            <div class="detail-text-row">
                <strong>Competitor:</strong>
                <span>${safe(lead.competitor_model || "-")}</span>
            </div>
        </div>

        <div class="detail-notes">
            <strong>Latest Notes / Follow-up Remarks</strong>
            <p>${safe(lead.notes || lead.followup_notes || "No notes added")}</p>
        </div>

        <div class="followup-history">
            <h3>📞 Follow-up History</h3>

            ${
                followups.length
                    ? followups.map(f => `
                        <div class="history-item">
                            <div class="history-top">
                                <strong>${safe(f.call_status || "-")}</strong>
                                <span>${fmtDate(f.created_at)}</span>
                            </div>

                            <p>${safe(f.customer_response || "-")}</p>
                            <small>Next: ${fmtDate(f.next_followup_at)}</small>
                            <small>By: ${safe(f.user_name || "User")}</small>
                            <div>${safe(f.remarks || "")}</div>
                        </div>
                    `).join("")
                    : `<div class="empty-state">No follow-up history yet</div>`
            }
        </div>

        <div class="activity-history">
            <h3>🧾 Activity History</h3>
            <div id="activityHistoryBox">
                <p class="muted">Loading activity history...</p>
            </div>
        </div>
    `;

    document.getElementById("leadDetailModal").classList.add("show");

    const activityBox = document.getElementById("activityHistoryBox");

    if (activityBox) {
        activityBox.innerHTML = await loadLeadActivity(id);
    }
    await loadLeadInventoryOptions(lead);
}
function closeLeadDetails() {
    document.getElementById("leadDetailModal").classList.remove("show");

    const box = document.getElementById("inventoryAllocationBox");
    if (box) box.innerHTML = "";
}
async function loadLeadActivity(id) {
    try {
        const logs = await request(`${API}/lead/${id}/activity`, {
            headers: authHeaders()
        });

        if (!logs.length) {
            return `<div class="empty-state">No activity history yet</div>`;
        }

        return logs.map(log => `
            <div class="activity-item">
                <div class="activity-top">
                    <strong>${safe(log.action || "-")}</strong>
                    <span>${fmtDate(log.created_at)}</span>
                </div>

                <div class="activity-body">
                    <p>${safe(log.remarks || "-")}</p>
                    <small>By: ${safe(log.user_name || "System")}</small>
                </div>
            </div>
        `).join("");

    } catch (err) {
        return `<div class="empty-state">Activity history failed to load</div>`;
    }
}

async function loadLeadInventoryOptions(lead) {
    const box = document.getElementById("inventoryAllocationBox");
    if (!box || !lead) return;

    box.innerHTML = `
        <h3>🚘 Vehicle Allocation</h3>
        <p class="muted">Checking available VIN inventory...</p>
    `;

    const search = [
        lead.car_interest,
        lead.variant_interest,
        lead.preferred_color
    ].filter(Boolean).join(" ");

    try {
        const vehicles = await request(
            `${API}/inventory?search=${encodeURIComponent(search)}&vehicle_status=AVAILABLE`,
            { headers: authHeaders() }
        );

        if (!vehicles.length) {
            box.innerHTML = `
                <h3>🚘 Vehicle Allocation</h3>
                <div class="empty-state">
                    No available VIN vehicle found for this lead.
                </div>
            `;
            return;
        }

        box.innerHTML = `
            <h3>🚘 Vehicle Allocation</h3>
            <button 
                onclick="openBookingFromLead(${lead.id}, ${lead.allocated_inventory_id || "null"})"
                class="save-btn"
            >
                🧾 Create / Open Booking
            </button>
            ${vehicles.slice(0, 5).map(vehicle => `
                <div class="inventory-option-card">
                    <strong>${safe(vehicle.model_name)} - ${safe(vehicle.variant_name || "-")}</strong>
                    <small>Color: ${safe(vehicle.color_name || "-")} | Branch: ${safe(vehicle.branch_name || "-")}</small>
                    <small>VIN: ${safe(vehicle.vin_number || "-")} | Status: ${safe(vehicle.vehicle_status || "-")}</small>
                    <small>PDI: ${safe(vehicle.pdi_status || "-")} | ETA: ${
                        vehicle.expected_arrival_date
                            ? new Date(vehicle.expected_arrival_date).toLocaleDateString("en-IN")
                            : "-"
                    }</small>

                    <button 
                        onclick="allocateInventoryToLead(${vehicle.id}, ${lead.id})"
                        class="save-btn"
                    >
                        Allocate This Vehicle
                    </button>
                </div>
            `).join("")}
        `;

    } catch (err) {
        box.innerHTML = `
            <h3>🚘 Vehicle Allocation</h3>
            <div class="stock-alert danger">
                Failed to load inventory options.
            </div>
        `;
    }
}

async function allocateInventoryToLead(inventoryId, leadId) {
    if (!confirm("Allocate this VIN vehicle to the selected lead?")) return;

    try {
        await request(`${API}/inventory/${inventoryId}/allocate-lead`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify({
                lead_id: leadId
            })
        });

        toast("Vehicle allocated to lead successfully");

        await loadPage();
        closeLeadDetails();

    } catch (err) {
        toast(err.message || "Vehicle allocation failed", true);
    }
}

function openEnquiryModal(id) {
    const modal = document.getElementById("enquiryModal");

    if (!modal) {
        alert("Enquiry modal not found in leads.html");
        return;
    }

    const lead = allLeads.find(l => Number(l.id) === Number(id));

    if (!lead) {
        return toast("Lead not found", true);
    }

    document.getElementById("enquiryLeadId").value = id;

    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value || "";
    };

    set("e_name", lead.name);
    set("e_phone", lead.phone);
    set("e_alt_phone", lead.alternate_phone);
    set("e_email", lead.email);
    set("e_area", lead.area);
    set("e_district", lead.district);
    set("e_profession", lead.profession);
    set("e_family", lead.family_members);

    set("e_vehicle_category", lead.vehicle_category);
    if (typeof loadVehicleModels === "function") loadVehicleModels();

    set("e_fuel_type", lead.fuel_type);
    set("e_car", lead.car_interest);

    if (typeof loadVehicleVariants === "function") loadVehicleVariants();
    set("e_variant", lead.variant_interest);

    if (typeof loadVehicleColors === "function") loadVehicleColors();
    set("e_color", lead.preferred_color);
    checkLeadStockAvailability();
    set("e_budget", lead.budget_range);
    set("e_timeline", lead.purchase_timeline);
    set("e_exchange", lead.exchange_vehicle);
    set("e_finance", lead.finance_required);

    set("e_testdrive", toISTInput(lead.test_drive_date));
    set("e_visit", toISTInput(lead.showroom_visit_date));
    set("e_booking", toISTInput(lead.booking_expected_date));

    set("e_notes", lead.notes || lead.followup_notes);

    modal.classList.add("show");
}
function closeEnquiryModal(){document.getElementById("enquiryModal").classList.remove("show");}
async function saveEnquiry() {
    const id = document.getElementById("enquiryLeadId").value;

    const get = id => document.getElementById(id)?.value || "";

    // For date inputs like 2026-05-09
    const date = value => value ? `${value}T00:00:00+05:30` : "";

    const payload = {
        name: get("e_name"),
        phone: get("e_phone"),
        alternate_phone: get("e_alt_phone"),
        email: get("e_email"),

        area: get("e_area"),
        district: get("e_district"),
        profession: get("e_profession"),
        family_members: get("e_family"),

        vehicle_category: get("e_vehicle_category"),
        fuel_type: get("e_fuel_type"),
        car_interest: get("e_car"),
        variant_interest: get("e_variant"),
        preferred_color: get("e_color"),

        budget_range: get("e_budget"),
        purchase_timeline: get("e_timeline"),
        exchange_vehicle: get("e_exchange"),
        finance_required: get("e_finance"),

        test_drive_date: date(get("e_testdrive")),
        showroom_visit_date: date(get("e_visit")),
        booking_expected_date: date(get("e_booking")),

        notes: get("e_notes")
    };

    try {
        await request(`${API}/lead/${id}`, {
            method: "PUT",
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast("Detailed enquiry saved");
        closeEnquiryModal();
        await loadPage();

    } catch (e) {
        toast(e.message, true);
    }
}

function openFollowup(id) {
    const modal = document.getElementById("followupModal");

    if (!modal) {
        alert("Follow-up modal not found in HTML");
        return;
    }

    document.getElementById("followupLeadId").value = id;
    document.getElementById("callStatus").value = "CONNECTED";
    document.getElementById("customerResponse").value = "INTERESTED";
    document.getElementById("nextFollowupAt").value = "";
    document.getElementById("followupRemarks").value = "";

    modal.classList.add("show");
}

function closeFollowupModal() {
    const modal = document.getElementById("followupModal");
    if (modal) modal.classList.remove("show");
}

async function submitFollowup() {
    const id = document.getElementById("followupLeadId").value;
    const call_status = document.getElementById("callStatus").value;
    const customer_response = document.getElementById("customerResponse").value;
    const rawDateTime = document.getElementById("nextFollowupAt").value;
    const remarks = document.getElementById("followupRemarks").value;

    const next_followup_at = rawDateTime ? `${rawDateTime}:00+05:30` : "";

    if (!next_followup_at) {
        alert("Please select next follow-up date and time");
        return;
    }

    try {
        await request(`${API}/lead/${id}/followup`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify({
                call_status,
                customer_response,
                next_followup_at,
                remarks
            })
        });

        alert("Follow-up saved successfully");
        closeFollowupModal();

        await loadPage();

        if (typeof loadAnalytics === "function") {
            await loadAnalytics();
        }

    } catch (error) {
        alert(error.message || "Follow-up save failed");
    }
}


function openOtpModal(id) {
    const modal = document.getElementById("otpModal");
    const lead = allLeads.find(l => Number(l.id) === Number(id));

    if (!modal) {
        alert("OTP modal not found in leads.html");
        return;
    }

    if (!lead) {
        toast("Lead not found", true);
        return;
    }

    document.getElementById("otpLeadId").value = id;
    document.getElementById("customerOtp").value = "";
    document.getElementById("otpRemarks").value = "";

    const info = document.getElementById("otpInfo");
    if (info) {
info.innerHTML = `
    <strong>Customer:</strong> ${lead.name || "-"} |
    <strong>Phone:</strong> ${lead.phone || "-"} |
    <strong>Status:</strong>
    <span class="${
        lead.verification_status === "VERIFIED"
            ? "verified"
            : "not-verified"
    }">
        ${lead.verification_status || "NOT_VERIFIED"}
    </span>
`;    }

    modal.classList.add("show");
}

function closeOtpModal() {
    const modal = document.getElementById("otpModal");
    if (modal) modal.classList.remove("show");
}

async function sendCustomerOtp() {
    const id = document.getElementById("otpLeadId").value;

    if (!id) {
        toast("Select a lead first", true);
        return;
    }

    try {
        const result = await request(`${API}/lead/${id}/send-otp`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify({})
        });

        const debugText = result.debug_otp ? ` OTP: ${result.debug_otp}` : "";
        toast(`OTP sent to ${result.phone || "customer"}.${debugText}`);
        await loadPage();

    } catch (error) {
        toast(error.message || "OTP send failed", true);
    }
}

async function verifyCustomerOtp() {
    const id = document.getElementById("otpLeadId").value;
    const otp = document.getElementById("customerOtp").value.trim();
    const remarks = document.getElementById("otpRemarks").value.trim();

    if (!id) {
        toast("Select a lead first", true);
        return;
    }

    if (!/^\d{6}$/.test(otp)) {
        toast("Enter valid 6 digit OTP", true);
        return;
    }

    try {
        await request(`${API}/lead/${id}/verify-otp`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify({ otp, remarks })
        });

        toast("Customer phone verified");
        closeOtpModal();
        await loadPage();

    } catch (error) {
        toast(error.message || "OTP verification failed", true);
    }
}

function openBookingFromLead(leadId, inventoryId = null) {
    sessionStorage.setItem("booking_lead_id", leadId);

    if (inventoryId) {
        sessionStorage.setItem("booking_inventory_id", inventoryId);
    }

    window.location.href = "bookings.html";
}

// Make functions available to HTML onclick
window.openOtpModal = openOtpModal;
window.closeOtpModal = closeOtpModal;
window.sendCustomerOtp = sendCustomerOtp;
window.verifyCustomerOtp = verifyCustomerOtp;

window.openFollowup = openFollowup;
window.closeFollowupModal = closeFollowupModal;
window.submitFollowup = submitFollowup;

window.openEnquiryModal = openEnquiryModal;
window.closeEnquiryModal = closeEnquiryModal;
window.saveEnquiry = saveEnquiry;

window.loadVehicleModels = loadVehicleModels;
window.loadVehicleVariants = loadVehicleVariants;
window.loadVehicleColors = loadVehicleColors;
window.syncFuelTypeFromVariant = syncFuelTypeFromVariant;
window.loadBranches = loadBranches;
window.checkLeadStockAvailability = checkLeadStockAvailability;
window.allocateInventoryToLead = allocateInventoryToLead;
window.openBookingFromLead = openBookingFromLead;
window.onload = async () => {
    if (user.role !== "admin") {
        document.querySelectorAll(".admin-only").forEach(e => e.style.display = "none");
    }

    initDragDrop();

    try {
        await loadVehicleMasters();
        await loadUsers();
        await loadBranches();
        await loadPage();

        setInterval(() => loadPage().catch(console.error), 50000);
    } catch (e) {
        toast(e.message, true);
    }
};