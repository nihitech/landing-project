let deliveryRows = [];
let branches = [];

if (!token) {
    window.location.href = "login.html";
}

function boolValue(id) {
    return document.getElementById(id)?.checked === true;
}

function setBool(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = value === true;
}

function value(id) {
    return document.getElementById(id)?.value || "";
}

function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
}

function dateOnly(value) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleDateString("en-IN");
}

function inputDate(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
}

function statusBadge(status) {
    const cls = String(status || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");

    return `<span class="badge ${cls}">${safe(status || "-")}</span>`;
}

async function loadBranches() {
    try {
        branches = await request(`${API}/branches`, {
            headers: authHeaders()
        });

        const select = document.getElementById("deliveryBranchFilter");
        if (!select) return;

        select.innerHTML = `<option value="">All Branches</option>` +
            branches.map(branch => `
                <option value="${branch.id}">
                    ${safe(branch.branch_name)} ${branch.branch_code ? `(${safe(branch.branch_code)})` : ""}
                </option>
            `).join("");

    } catch (err) {
        console.error("Delivery branch load failed:", err.message);
    }
}

function buildDeliveryQuery() {
    const params = new URLSearchParams();

    const search = value("deliverySearch").trim();
    const status = value("deliveryStatusFilter");
    const branchId = value("deliveryBranchFilter");

    if (search) params.set("search", search);
    if (status) params.set("delivery_status", status);
    if (branchId) params.set("branch_id", branchId);

    return params.toString();
}

async function loadDeliveries() {
    try {
        const query = buildDeliveryQuery();

        deliveryRows = await request(`${API}/delivery${query ? `?${query}` : ""}`, {
            headers: authHeaders()
        });

        renderDeliveries();

    } catch (err) {
        toast(err.message || "Failed to load delivery checklist", true);
    }
}

function renderDeliveries() {
    const tbody = document.getElementById("deliveryTable");
    if (!tbody) return;

    if (!deliveryRows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">No delivery checklist records found</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = deliveryRows.map(row => `
        <tr>
            <td>
                <strong>${safe(row.customer_name || "-")}</strong>
                <small>${safe(row.customer_phone || "-")}</small>
                <small>Lead: ${safe(row.lead_id || "-")}</small>
            </td>

            <td>
                <strong>${safe(row.model_name || "-")}</strong>
                <small>${safe(row.variant_name || "-")}</small>
                <small>Color: ${safe(row.color_name || "-")}</small>
                <small>Category: ${safe(row.vehicle_category || "-")}</small>
            </td>

            <td>
                <strong>${safe(row.vin_number || "-")}</strong>
                <small>Chassis: ${safe(row.chassis_number || "-")}</small>
            </td>

            <td>
                <strong>${safe(row.branch_name || "-")}</strong>
                <small>${safe(row.branch_code || "")}</small>
            </td>

            <td>
                <strong>${Number(row.delivery_ready_score || 0)}%</strong>
                <div class="mini-progress">
                    <span style="width:${Number(row.delivery_ready_score || 0)}%"></span>
                </div>
            </td>

            <td>${statusBadge(row.delivery_status || "PENDING")}</td>

            <td>
                ${dateOnly(row.planned_delivery_date)}
                <small>Actual: ${dateOnly(row.actual_delivery_date)}</small>
            </td>

            <td>
                <small>${safe(row.blocker_reason || "-")}</small>
            </td>

            <td class="compact-actions">
                <button 
                    onclick="openDeliveryModal(${row.inventory_id})"
                    class="icon-btn view-btn"
                    title="Edit Delivery Checklist"
                >✏️</button>
            </td>
        </tr>
    `).join("");
}

async function openDeliveryModal(inventoryId) {
    try {
        const row = await request(`${API}/delivery/inventory/${inventoryId}`, {
            headers: authHeaders()
        });

        setValue("deliveryInventoryId", row.inventory_id || inventoryId);
        setValue("deliveryLeadId", row.lead_id || row.allocated_lead_id || "");

        document.getElementById("deliveryInfoBox").innerHTML = `
            <div class="stock-mini-card">
                <strong>${safe(row.model_name || "-")} - ${safe(row.variant_name || "-")}</strong>
                <small>Color: ${safe(row.color_name || "-")} | VIN: ${safe(row.vin_number || "-")}</small>
                <small>Customer: ${safe(row.customer_name || row.allocated_customer_name || "-")} | Phone: ${safe(row.customer_phone || "-")}</small>
                <small>Branch: ${safe(row.branch_name || "-")} | Status: ${safe(row.vehicle_status || "-")}</small>
            </div>
        `;

        setBool("pdiCompleted", row.pdi_completed === true);
        setBool("accessoriesCompleted", row.accessories_completed === true);
        setBool("financeCompleted", row.finance_completed === true);
        setBool("insuranceCompleted", row.insurance_completed === true);
        setBool("rtoCompleted", row.rto_completed === true);
        setBool("fastagCompleted", row.fastag_completed === true);
        setBool("paymentCompleted", row.payment_completed === true);
        setBool("invoiceCompleted", row.invoice_completed === true);
        setBool("deliveryPhotoUploaded", row.delivery_photo_uploaded === true);
        setBool("customerConfirmation", row.customer_confirmation === true);

        setValue("plannedDeliveryDate", inputDate(row.planned_delivery_date));
        setValue("actualDeliveryDate", inputDate(row.actual_delivery_date));
        setValue("blockerReason", row.blocker_reason || "");
        setValue("deliveryRemarks", row.remarks || "");

        document.getElementById("deliveryModal").classList.add("show");

    } catch (err) {
        toast(err.message || "Failed to open delivery checklist", true);
    }
}

function closeDeliveryModal() {
    document.getElementById("deliveryModal").classList.remove("show");
}

function getDeliveryPayload() {
    return {
        inventory_id: value("deliveryInventoryId"),
        lead_id: value("deliveryLeadId") || null,

        pdi_completed: boolValue("pdiCompleted"),
        accessories_completed: boolValue("accessoriesCompleted"),
        finance_completed: boolValue("financeCompleted"),
        insurance_completed: boolValue("insuranceCompleted"),
        rto_completed: boolValue("rtoCompleted"),
        fastag_completed: boolValue("fastagCompleted"),
        payment_completed: boolValue("paymentCompleted"),
        invoice_completed: boolValue("invoiceCompleted"),
        delivery_photo_uploaded: boolValue("deliveryPhotoUploaded"),
        customer_confirmation: boolValue("customerConfirmation"),

        planned_delivery_date: value("plannedDeliveryDate") || null,
        actual_delivery_date: value("actualDeliveryDate") || null,
        blocker_reason: value("blockerReason").trim(),
        remarks: value("deliveryRemarks").trim()
    };
}

async function saveDeliveryChecklist() {
    const payload = getDeliveryPayload();

    if (!payload.inventory_id) {
        toast("Inventory vehicle is required", true);
        return;
    }

    try {
        await request(`${API}/delivery`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast("Delivery checklist saved");

        closeDeliveryModal();
        await loadDeliveries();

    } catch (err) {
        toast(err.message || "Delivery checklist save failed", true);
    }
}

window.loadDeliveries = loadDeliveries;
window.openDeliveryModal = openDeliveryModal;
window.closeDeliveryModal = closeDeliveryModal;
window.saveDeliveryChecklist = saveDeliveryChecklist;

window.onload = async () => {
    await loadBranches();
    await loadDeliveries();
};