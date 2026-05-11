
let users = [], allLeads = [];
const VEHICLE_COLORS = {
    "XUV700": [
        "Everest White",
        "Midnight Black",
        "Dazzling Silver",
        "Red Rage",
        "Electric Blue"
    ],

    "Scorpio N": [
        "Everest White",
        "Deep Forest",
        "Napoli Black",
        "Red Rage",
        "Dazzling Silver"
    ],

    "Scorpio Classic": [
        "Galaxy Grey",
        "Molten Red Rage",
        "Napoli Black",
        "Everest White"
    ],

    "Thar": [
        "Everest White",
        "Stealth Black",
        "Deep Grey",
        "Red Rage",
        "Desert Fury"
    ],

    "Thar ROXX": [
        "Nebula Blue",
        "Stealth Black",
        "Everest White",
        "Deep Forest",
        "Burnt Sienna"
    ],

    "XUV 3XO": [
        "Everest White",
        "Stealth Black",
        "Dune Beige",
        "Nebula Blue",
        "Red Rage"
    ],

    "Bolero": [
        "Diamond White",
        "Lakeside Brown",
        "Dsat Silver"
    ],

    "Bolero Neo": [
        "Diamond White",
        "Napoli Black",
        "Majestic Silver"
    ],

    "XUV400 EV": [
        "Arctic Blue",
        "Everest White",
        "Napoli Black",
        "Galaxy Grey"
    ],

    "BE 6": [
        "Desert Myst",
        "Deep Forest",
        "Tango Red",
        "Everest White",
        "Stealth Black"
    ],

    "XEV 9e": [
        "Nebula Blue",
        "Desert Myst",
        "Deep Forest",
        "Everest White",
        "Stealth Black"
    ]
};

async function loadUsers() {
    if (user.role !== "admin") return;
    users = await request(`${API}/auth/users`, { headers: authHeaders() });
}
async function loadPage() {
    const params = new URLSearchParams();
    const priority=document.getElementById("filter")?.value||""; const source=document.getElementById("sourceFilter")?.value||""; const search=document.getElementById("searchInput")?.value.trim()||"";
    if(priority) params.set("priority",priority); if(source) params.set("source",source); if(search) params.set("search",search);
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
<small>Color: ${safe(lead.preferred_color || "-")}</small></td><td>${safe(lead.source||"WEBSITE")}<small>${safe(lead.action_type||lead.lead_type||"ENQUIRY")}</small><small>${safe(lead.campaign_name||"-")}</small></td><td><span class="badge ${pc}">${safe(lead.priority||"COLD")}</span><small>Score: ${Number(lead.score||0)}</small></td><td><select onchange="updateStatus(${lead.id},this.value)">${STATUSES.map(s=>`<option value="${s}" ${lead.status===s?"selected":""}>${s}</option>`).join("")}</select></td><td class="admin-only">${assign}</td><td><button onclick="openFollowup(${lead.id})" class="followup-btn">📞 Follow-up</button><small>Next: ${fmtDate(lead.next_followup_at)}</small><small>Count: ${lead.followup_count||0}</small></td><td class="actions"><button onclick="openLeadDetails(${lead.id})" class="view-btn">View</button><button onclick="openEnquiryModal(${lead.id})" class="enquiry-btn">Enquiry</button><a href="tel:${phone}">📞</a><a href="https://wa.me/91${phone}" target="_blank">💬</a></td></tr>`; }).join("");
    if(user.role !== "admin") document.querySelectorAll(".admin-only").forEach(e=>e.style.display="none");
}
async function assignLead(id,userId){ try{ await request(`${API}/lead/${id}/assign`,{method:"PUT",headers:authHeaders(true),body:JSON.stringify({user_id:userId||null})}); toast(userId?"Lead assigned":"Lead unassigned"); await loadPage(); }catch(e){toast(e.message,true);} }
async function updateStatus(id, status) {
    try {
        const payload = { status };

        if (status === "LOST") {
            const lostReason = prompt("Why was this lead lost?");

            if (lostReason === null) {
                toast("Status update cancelled");
                await loadPage();
                return;
            }

            const competitorModel = prompt("Competitor model / showroom name, if any?");

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
async function openLeadDetails(id){ const lead=allLeads.find(l=>Number(l.id)===Number(id)); if(!lead)return toast("Lead not found",true); let followups=[]; try{followups=await request(`${API}/lead/${id}/followups`,{headers:authHeaders()});}catch{} document.getElementById("leadDetailContent").innerHTML=`<div class="detail-grid"><div><strong>Name</strong><span>${safe(lead.name)}</span></div><div><strong>Phone</strong><span>${safe(lead.phone)}</span></div><div><strong>Alt Phone</strong><span>${safe(lead.alternate_phone||"-")}</span></div><div><strong>Email</strong><span>${safe(lead.email||"-")}</span></div><div><strong>Area</strong><span>${safe(lead.area||"-")}</span></div><div><strong>District</strong><span>${safe(lead.district||"-")}</span></div><div><strong>Profession</strong><span>${safe(lead.profession||"-")}</span></div><div><strong>Family</strong><span>${safe(lead.family_members||"-")}</span></div><div><strong>Category / Fuel</strong><span>${safe(lead.vehicle_category||"-")} / ${safe(lead.fuel_type||"-")}</span></div><div><strong>Model / Variant</strong><span>${safe(lead.car_interest || "-")} / ${safe(lead.variant_interest || "-")}</span></div>
<div><strong>Preferred Color</strong><span>${safe(lead.preferred_color || "-")}</span></div><div><strong>Budget</strong><span>${safe(lead.budget_range||"-")}</span></div><div><strong>Timeline</strong><span>${safe(lead.purchase_timeline||"-")}</span></div><div><strong>Exchange</strong><span>${safe(lead.exchange_vehicle||"-")}</span></div><div><strong>Finance</strong><span>${safe(lead.finance_required||"-")}</span></div><div><strong>Test Drive</strong><span>${fmtDate(lead.test_drive_date)}</span></div><div><strong>Visit</strong><span>${fmtDate(lead.showroom_visit_date)}</span></div><div><strong>Booking Expected</strong><span>${fmtDate(lead.booking_expected_date)}</span></div><div><strong>Assigned</strong><span>${safe(lead.assigned_name||"Unassigned")}</span></div></div><div class="detail-notes"><strong>Latest Notes / Follow-up Remarks</strong><p>${safe(lead.notes||lead.followup_notes||"No notes added")}</p></div><div><strong>Lost Reason</strong><span>${safe(lead.lost_reason || "-")}</span></div>
<div><strong>Competitor</strong><span>${safe(lead.competitor_model || "-")}</span></div><div class="followup-history"><h3>📞 Follow-up History</h3>${followups.length?followups.map(f=>`<div class="history-item"><div class="history-top"><strong>${safe(f.call_status||"-")}</strong><span>${fmtDate(f.created_at)}</span></div><p>${safe(f.customer_response||"-")}</p><small>Next: ${fmtDate(f.next_followup_at)}</small><small>By: ${safe(f.user_name||"User")}</small><div>${safe(f.remarks||"")}</div></div>`).join(""):`<div class="empty-state">No follow-up history yet</div>`}</div>`; document.getElementById("leadDetailModal").classList.add("show"); }
function closeLeadDetails(){document.getElementById("leadDetailModal").classList.remove("show");}
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
function loadVehicleColors() {
    const model = document.getElementById("e_car")?.value;
    const colorSelect = document.getElementById("e_color");

    if (!colorSelect) return;

    colorSelect.innerHTML = `<option value="">Select Color</option>`;

    if (!model || !VEHICLE_COLORS[model]) return;

    VEHICLE_COLORS[model].forEach(color => {
        colorSelect.innerHTML += `<option value="${color}">${color}</option>`;
    });
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

// Make functions available to HTML onclick
window.openFollowup = openFollowup;
window.closeFollowupModal = closeFollowupModal;
window.submitFollowup = submitFollowup;

window.openEnquiryModal = openEnquiryModal;
window.closeEnquiryModal = closeEnquiryModal;
window.saveEnquiry = saveEnquiry;

window.loadVehicleModels = loadVehicleModels;
window.loadVehicleVariants = loadVehicleVariants;
window.loadVehicleColors = loadVehicleColors;
window.onload=async()=>{ if(user.role!=="admin") 
    document.querySelectorAll(".admin-only").forEach(e=>e.style.display="none"); initDragDrop(); try{ await loadUsers(); await loadPage(); setInterval(()=>loadPage().catch(console.error),50000);}catch(e){toast(e.message,true);} };
