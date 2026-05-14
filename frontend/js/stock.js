let stockRows = [];
let vehicleModels = [];
let vehicleVariants = [];
let vehicleColors = [];
let branches = [];

if (!token) {
    window.location.href = "login.html";
}

function isAdmin() {
    return user?.role === "admin";
}

function normalizeVehicleCategoryScope(value) {
    const scope = String(value || "ALL").toUpperCase();
    return ["ALL", "AD", "EV"].includes(scope) ? scope : "ALL";
}

function canManageStock() {
    const role = String(user?.role || "").toLowerCase();
    const managerRoles = ["admin", "manager", "branch_manager", "team_leader"];

    return managerRoles.includes(role) || user?.can_create === true || user?.can_edit === true;
}

function modelAllowedByUserScope(model) {
    const scope = normalizeVehicleCategoryScope(user?.vehicle_category_scope);

    if (scope === "ALL") return true;

    return String(model.vehicle_category || "").toUpperCase() === scope;
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

async function loadMasters() {
    try {
        const [models, variants, colors, branchList] = await Promise.all([
            request(`${API}/vehicles/models`, { headers: authHeaders() }),
            request(`${API}/vehicles/variants`, { headers: authHeaders() }),
            request(`${API}/vehicles/colors`, { headers: authHeaders() }),
            request(`${API}/branches`, { headers: authHeaders() })
        ]);

        vehicleModels = models || [];
        vehicleVariants = variants || [];
        vehicleColors = colors || [];
        branches = branchList || [];

        renderMasterOptions();

    } catch (err) {
        toast(err.message || "Failed to load stock masters", true);
    }
}

function renderMasterOptions() {
    const activeModels = vehicleModels.filter(m =>
        String(m.status || "ACTIVE") === "ACTIVE" &&
        modelAllowedByUserScope(m)
    );
    const activeBranches = branches.filter(b => String(b.status || "ACTIVE") === "ACTIVE");

    const modelOptions = `<option value="">Select Model</option>` +
        activeModels.map(m => optionHtml(m.id, `${m.model_name} (${m.vehicle_category || "-"})`)).join("");

    const filterModelOptions = `<option value="">All Models</option>` +
        activeModels.map(m => optionHtml(m.id, m.model_name)).join("");

    const branchOptions = `<option value="">Select Branch</option>` +
        activeBranches.map(b => optionHtml(b.id, `${b.branch_name} ${b.branch_code ? `(${b.branch_code})` : ""}`)).join("");

    const filterBranchOptions = `<option value="">All Branches</option>` +
        activeBranches.map(b => optionHtml(b.id, `${b.branch_name} ${b.branch_code ? `(${b.branch_code})` : ""}`)).join("");

    const modelSelect = document.getElementById("stockModelId");
    const filterModelSelect = document.getElementById("filterModelId");
    const branchSelect = document.getElementById("stockBranchId");
    const filterBranchSelect = document.getElementById("filterBranchId");

    if (modelSelect) modelSelect.innerHTML = modelOptions;
    if (filterModelSelect) filterModelSelect.innerHTML = filterModelOptions;
    if (branchSelect) branchSelect.innerHTML = branchOptions;
    if (filterBranchSelect) filterBranchSelect.innerHTML = filterBranchOptions;

    setupCategoryFilterByUserScope();
    handleStockModelChange();
}

function setupCategoryFilterByUserScope() {
    const scope = normalizeVehicleCategoryScope(user?.vehicle_category_scope);
    const filter = document.getElementById("filterVehicleCategory");

    if (!filter) return;

    if (scope === "AD" || scope === "EV") {
        filter.value = scope;
        filter.disabled = true;
    } else {
        filter.disabled = false;
    }
}

function handleStockCategoryFilterChange() {
    const category = document.getElementById("filterVehicleCategory")?.value || "";
    const filterModel = document.getElementById("filterModelId");

    if (filterModel) {
        const filteredModels = vehicleModels.filter(model => {
            const active = String(model.status || "ACTIVE") === "ACTIVE";
            const allowed = modelAllowedByUserScope(model);
            const categoryMatch = !category || String(model.vehicle_category || "") === category;
            return active && allowed && categoryMatch;
        });

        filterModel.innerHTML = `<option value="">All Models</option>` +
            filteredModels.map(m => optionHtml(m.id, m.model_name)).join("");
    }

    loadStock();
}

function handleStockModelChange() {
    const modelId = document.getElementById("stockModelId")?.value;
    const variantSelect = document.getElementById("stockVariantId");
    const colorSelect = document.getElementById("stockColorId");

    if (!variantSelect || !colorSelect) return;

    variantSelect.innerHTML = `<option value="">Select Variant</option>`;
    colorSelect.innerHTML = `<option value="">Select Color</option>`;

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
}

function handleStockStatusFields() {
    const status =
        document.getElementById("stockStatus")?.value || "AVAILABLE";

    document.querySelectorAll(".stock-field").forEach(el => {
        el.style.display = "none";
    });

    const show = selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.style.display = "block";
        });
    };

    switch (status) {

        case "AVAILABLE":
        case "LOW_STOCK":
        case "DISPLAY":
        case "DEMO":
        case "TEST_DRIVE":
            show(".stock-available");
            break;

        case "BOOKED":
        case "ALLOCATED_TO_CUSTOMER":
            show(".stock-booked");
            break;

        case "IN_TRANSIT":
        case "ARRIVED_YARD":
        case "ARRIVED_BRANCH":
            show(".stock-transit");
            show(".stock-arrival");
            break;

        case "BILLING_SOON":
        case "OEM_BILLED":
            show(".stock-billing");
            show(".stock-arrival");
            break;

        case "WAITING":
        case "PRODUCTION_DELAY":
        case "NOT_AVAILABLE":
            show(".stock-waiting");
            break;

        case "PDI_PENDING":
        case "PDI_DONE":
            show(".stock-arrival");
            break;

        default:
            show(".stock-available");
    }
}

function buildStockQuery() {
    const params = new URLSearchParams();

    const branchId = document.getElementById("filterBranchId")?.value || "";
    const modelId = document.getElementById("filterModelId")?.value || "";
    const stockStatus = document.getElementById("filterStockStatus")?.value || "";
    const vehicleCategory = document.getElementById("filterVehicleCategory")?.value || "";

    if (branchId) params.set("branch_id", branchId);
    if (modelId) params.set("model_id", modelId);
    if (stockStatus) params.set("stock_status", stockStatus);
    if (vehicleCategory) params.set("vehicle_category", vehicleCategory);

    return params.toString();
}

async function loadStock() {
    try {
        const query = buildStockQuery();
        stockRows = await request(`${API}/stock${query ? `?${query}` : ""}`, {
            headers: authHeaders()
        });

        renderStock();

    } catch (err) {
        toast(err.message || "Failed to load stock", true);
    }
}

function renderStock() {
    const tbody = document.getElementById("stockTable");
    if (!tbody) return;

    if (!stockRows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="empty-state">No stock records found</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = stockRows.map(row => {
        const statusClass = String(row.stock_status || "AVAILABLE").toLowerCase();

        return `
            <tr>
                <td>
                    <strong>${safe(row.branch_name || "-")}</strong>
                    <small>${safe(row.branch_code || "")}</small>
                </td>

                <td>
                    <strong>${safe(row.model_name || "-")}</strong>
                    <small>Category: ${safe(row.vehicle_category || "-")}</small>
                    <small>${safe(row.variant_name || "-")}</small>
                    <small>Color: ${safe(row.color_name || "-")}</small>
                </td>

                <td>
                    <span class="badge ${statusClass}">
                        ${safe(row.stock_status || "-")}
                    </span>
                    <small>${safe(row.status || "ACTIVE")}</small>
                </td>

                <td><strong>${Number(row.available_quantity || 0)}</strong></td>
                <td>${Number(row.booked_quantity || 0)}</td>
                <td>${Number(row.in_transit_quantity || 0)}</td>
                <td>${Number(row.billing_soon_quantity || 0)}</td>

                <td>
                    ${Number(row.waiting_period_days || 0)} days
                </td>

                <td>${safe(formatDateOnly(row.expected_arrival_date))}</td>

                <td>
                    <small>${safe(row.remarks || "-")}</small>
                </td>

                <td class="compact-actions">
                    <button 
                        onclick='editStock(${JSON.stringify(row)})'
                        class="icon-btn view-btn"
                        title="Edit Stock"
                    >✏️</button>

                    <button 
                        onclick="deactivateStock(${row.id})"
                        class="icon-btn verify-btn"
                        title="Deactivate Stock"
                    >⛔</button>
                </td>
            </tr>
        `;
    }).join("");
}

function getStockPayload() {
    return {
        branch_id: document.getElementById("stockBranchId").value,
        model_id: document.getElementById("stockModelId").value,
        variant_id: document.getElementById("stockVariantId").value,
        color_id: document.getElementById("stockColorId").value,

        stock_status: document.getElementById("stockStatus").value,

        available_quantity: document.getElementById("availableQuantity").value || 0,
        booked_quantity: document.getElementById("bookedQuantity").value || 0,
        in_transit_quantity: document.getElementById("inTransitQuantity").value || 0,
        billing_soon_quantity: document.getElementById("billingSoonQuantity").value || 0,

        waiting_period_days: document.getElementById("waitingPeriodDays").value || 0,
        expected_arrival_date: document.getElementById("expectedArrivalDate").value || null,

        remarks: document.getElementById("stockRemarks").value.trim(),
        status: document.getElementById("recordStatus").value
    };
}

async function saveStock() {
    if (!canManageStock()) {
        toast("You do not have permission to save stock", true);
        return;
    }

    const stockId = document.getElementById("stockId").value;
    const payload = getStockPayload();

    if (!payload.branch_id || !payload.model_id || !payload.variant_id || !payload.color_id) {
        toast("Branch, model, variant and color are required", true);
        return;
    }

    const url = stockId ? `${API}/stock/${stockId}` : `${API}/stock`;
    const method = stockId ? "PUT" : "POST";

    try {
        await request(url, {
            method,
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast(stockId ? "Stock updated successfully" : "Stock created successfully");

        resetStockForm();
        await loadStock();

    } catch (err) {
        toast(err.message || "Stock save failed", true);
    }
}

function editStock(row) {
    document.getElementById("stockFormTitle").innerText = "Edit Stock Summary";
    document.getElementById("stockId").value = row.id || "";

    document.getElementById("stockBranchId").value = row.branch_id || "";
    document.getElementById("stockModelId").value = row.model_id || "";

    handleStockModelChange();

    document.getElementById("stockVariantId").value = row.variant_id || "";
    document.getElementById("stockColorId").value = row.color_id || "";

    document.getElementById("stockStatus").value = row.stock_status || "AVAILABLE";

    document.getElementById("availableQuantity").value = row.available_quantity || 0;
    document.getElementById("bookedQuantity").value = row.booked_quantity || 0;
    document.getElementById("inTransitQuantity").value = row.in_transit_quantity || 0;
    document.getElementById("billingSoonQuantity").value = row.billing_soon_quantity || 0;
    document.getElementById("waitingPeriodDays").value = row.waiting_period_days || 0;

    document.getElementById("expectedArrivalDate").value =
        row.expected_arrival_date
            ? String(row.expected_arrival_date).slice(0, 10)
            : "";

    document.getElementById("stockRemarks").value = row.remarks || "";
    document.getElementById("recordStatus").value = row.status || "ACTIVE";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function resetStockForm() {
    document.getElementById("stockFormTitle").innerText = "Add Stock Summary";
    document.getElementById("stockId").value = "";

    document.getElementById("stockBranchId").value = "";
    document.getElementById("stockModelId").value = "";
    document.getElementById("stockVariantId").innerHTML = `<option value="">Select Variant</option>`;
    document.getElementById("stockColorId").innerHTML = `<option value="">Select Color</option>`;

    document.getElementById("stockStatus").value = "AVAILABLE";

    document.getElementById("availableQuantity").value = 0;
    document.getElementById("bookedQuantity").value = 0;
    document.getElementById("inTransitQuantity").value = 0;
    document.getElementById("billingSoonQuantity").value = 0;
    document.getElementById("waitingPeriodDays").value = 0;
    document.getElementById("expectedArrivalDate").value = "";

    document.getElementById("stockRemarks").value = "";
    document.getElementById("recordStatus").value = "ACTIVE";
}

async function deactivateStock(id) {
    if (!canManageStock()) {
        toast("You do not have permission to deactivate stock", true);
        return;
    }

    if (!confirm("Deactivate this stock record?")) return;

    try {
        await request(`${API}/stock/${id}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        toast("Stock deactivated");
        await loadStock();

    } catch (err) {
        toast(err.message || "Deactivate failed", true);
    }
}

window.handleStockModelChange = handleStockModelChange;
window.handleStockCategoryFilterChange = handleStockCategoryFilterChange;
window.loadStock = loadStock;
window.saveStock = saveStock;
window.editStock = editStock;
window.deactivateStock = deactivateStock;
window.resetStockForm = resetStockForm;
window.handleStockStatusFields = handleStockStatusFields;

window.onload = async () => {
    if (!canManageStock()) {
        toast("You do not have permission to access Stock Intelligence", true);
        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1200);
        return;
    }

    await loadMasters();
    handleStockStatusFields();
    await loadStock();
};