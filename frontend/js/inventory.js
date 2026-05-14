let inventoryRows = [];
let vehicleModels = [];
let vehicleVariants = [];
let vehicleColors = [];
let branches = [];

if (!token) {
    window.location.href = "login.html";
}

function optionHtml(value, label) {
    return `<option value="${value}">${safe(label)}</option>`;
}

function formatDateOnly(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleDateString("en-IN");
}

function statusBadge(status) {
    const cls = String(status || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");

    return `
        <span class="badge ${cls}">
            ${safe(status || "-")}
        </span>
    `;
}

async function loadMasters() {
    try {
        const [models, variants, colors, branchList] = await Promise.all([
            request(`${API}/vehicles/models`, {
                headers: authHeaders()
            }),

            request(`${API}/vehicles/variants`, {
                headers: authHeaders()
            }),

            request(`${API}/vehicles/colors`, {
                headers: authHeaders()
            }),

            request(`${API}/branches`, {
                headers: authHeaders()
            })
        ]);

        vehicleModels = models || [];
        vehicleVariants = variants || [];
        vehicleColors = colors || [];
        branches = branchList || [];

        renderMasterOptions();

    } catch (err) {
        toast(err.message || "Failed to load masters", true);
    }
}

function renderMasterOptions() {
    const activeModels = vehicleModels.filter(
        m => String(m.status || "ACTIVE") === "ACTIVE"
    );

    const activeBranches = branches.filter(
        b => String(b.status || "ACTIVE") === "ACTIVE"
    );

    const modelOptions =
        `<option value="">Select Model</option>` +
        activeModels.map(m =>
            optionHtml(
                m.id,
                `${m.model_name} (${m.vehicle_category || "-"})`
            )
        ).join("");

    const filterModelOptions =
        `<option value="">All Models</option>` +
        activeModels.map(m =>
            optionHtml(m.id, m.model_name)
        ).join("");

    const branchOptions =
        `<option value="">Select Branch</option>` +
        activeBranches.map(b =>
            optionHtml(
                b.id,
                `${b.branch_name}${b.branch_code ? ` (${b.branch_code})` : ""}`
            )
        ).join("");

    const filterBranchOptions =
        `<option value="">All Branches</option>` +
        activeBranches.map(b =>
            optionHtml(
                b.id,
                `${b.branch_name}${b.branch_code ? ` (${b.branch_code})` : ""}`
            )
        ).join("");

    document.getElementById("modelId").innerHTML = modelOptions;
    document.getElementById("filterModelId").innerHTML = filterModelOptions;

    document.getElementById("branchId").innerHTML = branchOptions;
    document.getElementById("filterBranchId").innerHTML = filterBranchOptions;

    handleModelChange();
}

function handleModelChange() {
    const modelId =
        document.getElementById("modelId")?.value || "";

    const variantSelect =
        document.getElementById("variantId");

    const colorSelect =
        document.getElementById("colorId");

    variantSelect.innerHTML =
        `<option value="">Select Variant</option>`;

    colorSelect.innerHTML =
        `<option value="">Select Color</option>`;

    if (!modelId) return;

    const filteredVariants = vehicleVariants.filter(v =>
        Number(v.model_id) === Number(modelId) &&
        String(v.status || "ACTIVE") === "ACTIVE"
    );

    const filteredColors = vehicleColors.filter(c =>
        Number(c.model_id) === Number(modelId) &&
        String(c.status || "ACTIVE") === "ACTIVE"
    );

    variantSelect.innerHTML += filteredVariants.map(v =>
        optionHtml(v.id, v.variant_name)
    ).join("");

    colorSelect.innerHTML += filteredColors.map(c =>
        optionHtml(c.id, c.color_name)
    ).join("");

    const model = vehicleModels.find(
        m => Number(m.id) === Number(modelId)
    );

    if (model?.vehicle_category) {
        document.getElementById("vehicleCategory").value =
            model.vehicle_category;
    }
}

function buildInventoryQuery() {
    const params = new URLSearchParams();

    const search =
        document.getElementById("searchInput")?.value?.trim();

    const category =
        document.getElementById("filterCategory")?.value;

    const branchId =
        document.getElementById("filterBranchId")?.value;

    const modelId =
        document.getElementById("filterModelId")?.value;

    const vehicleStatus =
        document.getElementById("filterVehicleStatus")?.value;

    if (search) params.set("search", search);
    if (category) params.set("vehicle_category", category);
    if (branchId) params.set("branch_id", branchId);
    if (modelId) params.set("model_id", modelId);
    if (vehicleStatus) params.set("vehicle_status", vehicleStatus);

    return params.toString();
}

async function loadInventory() {
    try {
        const query = buildInventoryQuery();

        inventoryRows = await request(
            `${API}/inventory${query ? `?${query}` : ""}`,
            {
                headers: authHeaders()
            }
        );

        renderInventory();

    } catch (err) {
        toast(err.message || "Failed to load inventory", true);
    }
}

function renderInventory() {
    const tbody =
        document.getElementById("inventoryTable");

    if (!tbody) return;

    if (!inventoryRows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    No inventory vehicles found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = inventoryRows.map(row => `
        <tr>
            <td>
                <strong>
                    ${safe(row.model_name || "-")}
                </strong>

                <small>
                    ${safe(row.variant_name || "-")}
                </small>

                <small>
                    Color: ${safe(row.color_name || "-")}
                </small>

                <small>
                    Category: ${safe(row.vehicle_category || "-")}
                </small>
            </td>

            <td>
                <strong>
                    ${safe(row.vin_number || "-")}
                </strong>

                <small>
                    Chassis:
                    ${safe(row.chassis_number || "-")}
                </small>

                <small>
                    Engine:
                    ${safe(row.engine_number || "-")}
                </small>
            </td>

            <td>
                <strong>
                    ${safe(row.branch_name || "-")}
                </strong>

                <small>
                    ${safe(row.branch_code || "")}
                </small>

                <small>
                    Yard:
                    ${safe(row.yard_location || "-")}
                </small>
            </td>

            <td>
                ${statusBadge(row.vehicle_status)}

                <small>
                    Live:
                    ${safe(row.live_status || "-")}
                </small>
            </td>

            <td>
                <small>
                    OEM Bill:
                    ${safe(row.oem_invoice_no || "-")}
                </small>

                <small>
                    Billing:
                    ${formatDateOnly(row.oem_billing_date)}
                </small>

                <small>
                    Dispatch:
                    ${formatDateOnly(row.dispatch_date)}
                </small>

                <small>
                    ETA:
                    ${formatDateOnly(row.expected_arrival_date)}
                </small>
            </td>

            <td>
                ${statusBadge(row.pdi_status)}

                <small>
                    Arrival:
                    ${formatDateOnly(row.actual_arrival_date)}
                </small>
            </td>

            <td>
                <small>
                    Lead:
                    ${safe(row.allocated_lead_id || "-")}
                </small>

                <small>
                    Customer:
                    ${safe(row.allocated_customer_name || "-")}
                </small>

                <small>
                    Booking:
                    ${safe(row.booking_id || "-")}
                </small>
            </td>

            <td>
                <small>
                    Retail:
                    ${formatDateOnly(row.retail_date)}
                </small>

                <small>
                    Delivery:
                    ${formatDateOnly(row.delivery_date)}
                </small>

                <small>
                    Invoice:
                    ${safe(row.customer_invoice_no || "-")}
                </small>
            </td>

            <td>
                <strong>
                    ${Number(row.stock_age_days || 0)}
                </strong> days
            </td>

            <td class="compact-actions">
                <button
                    onclick='editInventory(${JSON.stringify(row)})'
                    class="icon-btn view-btn"
                    title="Edit Inventory"
                >
                    ✏️
                </button>

                <button
                    onclick="deactivateInventory(${row.id})"
                    class="icon-btn verify-btn"
                    title="Deactivate"
                >
                    ⛔
                </button>
            </td>
        </tr>
    `).join("");
}

function getInventoryPayload() {
    return {
        model_id:
            document.getElementById("modelId").value,

        variant_id:
            document.getElementById("variantId").value,

        color_id:
            document.getElementById("colorId").value,

        branch_id:
            document.getElementById("branchId").value,

        vehicle_category:
            document.getElementById("vehicleCategory").value,

        vin_number:
            document.getElementById("vinNumber").value.trim(),

        chassis_number:
            document.getElementById("chassisNumber").value.trim(),

        engine_number:
            document.getElementById("engineNumber").value.trim(),

        vehicle_status:
            document.getElementById("vehicleStatus").value,

        oem_order_no:
            document.getElementById("oemOrderNo").value.trim(),

        oem_invoice_no:
            document.getElementById("oemInvoiceNo").value.trim(),

        oem_billing_date:
            document.getElementById("oemBillingDate").value || null,

        dispatch_date:
            document.getElementById("dispatchDate").value || null,

        expected_arrival_date:
            document.getElementById("expectedArrivalDate").value || null,

        actual_arrival_date:
            document.getElementById("actualArrivalDate").value || null,

        pdi_status:
            document.getElementById("pdiStatus").value,

        allocated_lead_id:
            document.getElementById("allocatedLeadId").value || null,

        allocated_customer_name:
            document.getElementById("allocatedCustomerName").value.trim(),

        booking_id:
            document.getElementById("bookingId").value.trim(),

        customer_invoice_no:
            document.getElementById("customerInvoiceNo").value.trim(),

        retail_date:
            document.getElementById("retailDate").value || null,

        delivery_date:
            document.getElementById("deliveryDate").value || null,

        yard_location:
            document.getElementById("yardLocation").value.trim(),

        remarks:
            document.getElementById("remarks").value.trim(),

        status:
            document.getElementById("recordStatus").value
    };
}

async function saveInventory() {
    const inventoryId =
        document.getElementById("inventoryId").value;

    const payload = getInventoryPayload();

    if (
        !payload.model_id ||
        !payload.variant_id ||
        !payload.color_id ||
        !payload.branch_id
    ) {
        toast(
            "Model, variant, color and branch are required",
            true
        );
        return;
    }

    const url = inventoryId
        ? `${API}/inventory/${inventoryId}`
        : `${API}/inventory`;

    const method = inventoryId ? "PUT" : "POST";

    try {
        await request(url, {
            method,
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast(
            inventoryId
                ? "Inventory updated successfully"
                : "Inventory created successfully"
        );

        resetInventoryForm();

        await loadInventory();

    } catch (err) {
        toast(err.message || "Inventory save failed", true);
    }
}

function editInventory(row) {
    document.getElementById("inventoryFormTitle").innerText =
        "Edit Vehicle Inventory";

    document.getElementById("inventoryId").value =
        row.id || "";

    document.getElementById("vehicleCategory").value =
        row.vehicle_category || "AD";

    document.getElementById("branchId").value =
        row.branch_id || "";

    document.getElementById("modelId").value =
        row.model_id || "";

    handleModelChange();

    document.getElementById("variantId").value =
        row.variant_id || "";

    document.getElementById("colorId").value =
        row.color_id || "";

    document.getElementById("vehicleStatus").value =
        row.vehicle_status || "AVAILABLE";

    document.getElementById("vinNumber").value =
        row.vin_number || "";

    document.getElementById("chassisNumber").value =
        row.chassis_number || "";

    document.getElementById("engineNumber").value =
        row.engine_number || "";

    document.getElementById("oemOrderNo").value =
        row.oem_order_no || "";

    document.getElementById("oemInvoiceNo").value =
        row.oem_invoice_no || "";

    document.getElementById("oemBillingDate").value =
        row.oem_billing_date
            ? String(row.oem_billing_date).slice(0, 10)
            : "";

    document.getElementById("dispatchDate").value =
        row.dispatch_date
            ? String(row.dispatch_date).slice(0, 10)
            : "";

    document.getElementById("expectedArrivalDate").value =
        row.expected_arrival_date
            ? String(row.expected_arrival_date).slice(0, 10)
            : "";

    document.getElementById("actualArrivalDate").value =
        row.actual_arrival_date
            ? String(row.actual_arrival_date).slice(0, 10)
            : "";

    document.getElementById("pdiStatus").value =
        row.pdi_status || "PDI_PENDING";

    document.getElementById("allocatedLeadId").value =
        row.allocated_lead_id || "";

    document.getElementById("allocatedCustomerName").value =
        row.allocated_customer_name || "";

    document.getElementById("bookingId").value =
        row.booking_id || "";

    document.getElementById("customerInvoiceNo").value =
        row.customer_invoice_no || "";

    document.getElementById("retailDate").value =
        row.retail_date
            ? String(row.retail_date).slice(0, 10)
            : "";

    document.getElementById("deliveryDate").value =
        row.delivery_date
            ? String(row.delivery_date).slice(0, 10)
            : "";

    document.getElementById("yardLocation").value =
        row.yard_location || "";

    document.getElementById("remarks").value =
        row.remarks || "";

    document.getElementById("recordStatus").value =
        row.status || "ACTIVE";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function resetInventoryForm() {
    document.getElementById("inventoryFormTitle").innerText =
        "Add Vehicle Inventory Unit";

    document.getElementById("inventoryId").value = "";

    document.getElementById("vehicleCategory").value = "AD";
    document.getElementById("branchId").value = "";
    document.getElementById("modelId").value = "";

    document.getElementById("variantId").innerHTML =
        `<option value="">Select Variant</option>`;

    document.getElementById("colorId").innerHTML =
        `<option value="">Select Color</option>`;

    document.getElementById("vehicleStatus").value =
        "AVAILABLE";

    [
        "vinNumber",
        "chassisNumber",
        "engineNumber",
        "oemOrderNo",
        "oemInvoiceNo",
        "oemBillingDate",
        "dispatchDate",
        "expectedArrivalDate",
        "actualArrivalDate",
        "allocatedLeadId",
        "allocatedCustomerName",
        "bookingId",
        "customerInvoiceNo",
        "retailDate",
        "deliveryDate",
        "yardLocation",
        "remarks"
    ].forEach(id => {
        const el = document.getElementById(id);

        if (el) el.value = "";
    });

    document.getElementById("pdiStatus").value =
        "PDI_PENDING";

    document.getElementById("recordStatus").value =
        "ACTIVE";
}

async function deactivateInventory(id) {
    if (!confirm("Deactivate this inventory vehicle?")) {
        return;
    }

    try {
        await request(`${API}/inventory/${id}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        toast("Inventory deactivated");

        await loadInventory();

    } catch (err) {
        toast(err.message || "Deactivate failed", true);
    }
}

window.handleModelChange = handleModelChange;
window.loadInventory = loadInventory;
window.saveInventory = saveInventory;
window.editInventory = editInventory;
window.deactivateInventory = deactivateInventory;
window.resetInventoryForm = resetInventoryForm;

window.onload = async () => {
    await loadMasters();
    await loadInventory();
};