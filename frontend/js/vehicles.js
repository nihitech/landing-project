let vehicleModels = [];
let vehicleVariants = [];
let vehicleColors = [];

if (!token) {
    window.location.href = "login.html";
}

function isAdmin() {
    return isHigherAuthority ? isHigherAuthority(user?.role) : user?.role === "admin";
}

function canManageVehicles() {
    const role = String(user?.role || "").toLowerCase();
    const managerRoles = ["admin", "manager", "branch_manager", "team_leader"];

    return managerRoles.includes(role) || user?.can_create === true || user?.can_edit === true;
}

function modelNameById(modelId) {
    const model = vehicleModels.find(m => Number(m.id) === Number(modelId));
    return model?.model_name || "-";
}

async function loadVehicleData() {
    try {
        const [models, variants, colors] = await Promise.all([
            request(`${API}/vehicles/models`, { headers: authHeaders() }),
            request(`${API}/vehicles/variants`, { headers: authHeaders() }),
            request(`${API}/vehicles/colors`, { headers: authHeaders() })
        ]);

        vehicleModels = models || [];
        vehicleVariants = variants || [];
        vehicleColors = colors || [];

        renderModelOptions();
        renderModels();
        renderVariants();
        renderColors();

    } catch (err) {
        toast(err.message || "Failed to load vehicle data", true);
    }
}

function renderModelOptions() {
    const activeModels = vehicleModels.filter(m => String(m.status || "ACTIVE") === "ACTIVE");

    const options = `<option value="">Select Model</option>` +
        activeModels.map(model => `
            <option value="${model.id}">
                ${safe(model.model_name)} ${model.vehicle_category ? `(${safe(model.vehicle_category)})` : ""}
            </option>
        `).join("");

    const variantSelect = document.getElementById("variantModelId");
    const colorSelect = document.getElementById("colorModelId");

    if (variantSelect) variantSelect.innerHTML = options;
    if (colorSelect) colorSelect.innerHTML = options;
}

function renderModels() {
    const tbody = document.getElementById("modelTable");
    if (!tbody) return;

    if (!vehicleModels.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No vehicle models found</td></tr>`;
        return;
    }

    tbody.innerHTML = vehicleModels.map(model => `
        <tr>
            <td>
                <strong>${safe(model.model_name)}</strong>
                <small>ID: ${model.id}</small>
            </td>
            <td>${safe(model.brand_name || "Mahindra")}</td>
            <td>${safe(model.vehicle_category || "-")}</td>
            <td>${safe(model.fuel_type || "-")}</td>
            <td>
                <span class="badge ${String(model.status || "ACTIVE").toLowerCase()}">
                    ${safe(model.status || "ACTIVE")}
                </span>
            </td>
            <td class="compact-actions">
                <button onclick='editModel(${JSON.stringify(model)})' class="icon-btn view-btn" title="Edit Model">✏️</button>
                <button onclick="deactivateModel(${model.id})" class="icon-btn verify-btn" title="Deactivate Model">⛔</button>
            </td>
        </tr>
    `).join("");
}

function renderVariants() {
    const tbody = document.getElementById("variantTable");
    if (!tbody) return;

    if (!vehicleVariants.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No vehicle variants found</td></tr>`;
        return;
    }

    tbody.innerHTML = vehicleVariants.map(variant => `
        <tr>
            <td>${safe(variant.model_name || modelNameById(variant.model_id))}</td>
            <td>
                <strong>${safe(variant.variant_name)}</strong>
                <small>ID: ${variant.id}</small>
            </td>
            <td>${safe(variant.transmission || "-")}</td>
            <td>${safe(variant.fuel_type || "-")}</td>
            <td>${safe(variant.price_range || "-")}</td>
            <td>
                <span class="badge ${String(variant.status || "ACTIVE").toLowerCase()}">
                    ${safe(variant.status || "ACTIVE")}
                </span>
            </td>
            <td class="compact-actions">
                <button onclick='editVariant(${JSON.stringify(variant)})' class="icon-btn view-btn" title="Edit Variant">✏️</button>
                <button onclick="deactivateVariant(${variant.id})" class="icon-btn verify-btn" title="Deactivate Variant">⛔</button>
            </td>
        </tr>
    `).join("");
}

function renderColors() {
    const tbody = document.getElementById("colorTable");
    if (!tbody) return;

    if (!vehicleColors.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No vehicle colors found</td></tr>`;
        return;
    }

    tbody.innerHTML = vehicleColors.map(color => `
        <tr>
            <td>${safe(color.model_name || modelNameById(color.model_id))}</td>
            <td>
                <strong>${safe(color.color_name)}</strong>
                <small>ID: ${color.id}</small>
            </td>
            <td>
                <span class="badge ${String(color.status || "ACTIVE").toLowerCase()}">
                    ${safe(color.status || "ACTIVE")}
                </span>
            </td>
            <td class="compact-actions">
                <button onclick='editColor(${JSON.stringify(color)})' class="icon-btn view-btn" title="Edit Color">✏️</button>
                <button onclick="deactivateColor(${color.id})" class="icon-btn verify-btn" title="Deactivate Color">⛔</button>
            </td>
        </tr>
    `).join("");
}

/* ===============================
   MODEL CRUD
================================ */
function getModelPayload() {
    return {
        brand_name: document.getElementById("brandName").value.trim(),
        model_name: document.getElementById("modelName").value.trim(),
        vehicle_category: document.getElementById("vehicleCategory").value,
        fuel_type: document.getElementById("modelFuelType").value.trim(),
        status: document.getElementById("modelStatus").value
    };
}

async function saveModel() {
    if (!canManageVehicles()) {
        toast("You do not have permission to save vehicle models", true);
        return;
    }

    const id = document.getElementById("modelId").value;
    const payload = getModelPayload();

    if (!payload.model_name) {
        toast("Model name is required", true);
        return;
    }

    const url = id ? `${API}/vehicles/models/${id}` : `${API}/vehicles/models`;
    const method = id ? "PUT" : "POST";

    try {
        await request(url, {
            method,
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast(id ? "Vehicle model updated" : "Vehicle model created");
        resetModelForm();
        await loadVehicleData();

    } catch (err) {
        toast(err.message || "Model save failed", true);
    }
}

function editModel(model) {
    document.getElementById("modelFormTitle").innerText = "Edit Vehicle Model";
    document.getElementById("modelId").value = model.id || "";
    document.getElementById("brandName").value = model.brand_name || "Mahindra";
    document.getElementById("modelName").value = model.model_name || "";
    document.getElementById("vehicleCategory").value = model.vehicle_category || "";
    document.getElementById("modelFuelType").value = model.fuel_type || "";
    document.getElementById("modelStatus").value = model.status || "ACTIVE";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetModelForm() {
    document.getElementById("modelFormTitle").innerText = "Add Vehicle Model";
    document.getElementById("modelId").value = "";
    document.getElementById("brandName").value = "Mahindra";
    document.getElementById("modelName").value = "";
    document.getElementById("vehicleCategory").value = "";
    document.getElementById("modelFuelType").value = "";
    document.getElementById("modelStatus").value = "ACTIVE";
}

async function deactivateModel(id) {
    if (!confirm("Deactivate this model?")) return;

    try {
        await request(`${API}/vehicles/models/${id}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        toast("Vehicle model deactivated");
        await loadVehicleData();

    } catch (err) {
        toast(err.message || "Deactivate failed", true);
    }
}

/* ===============================
   VARIANT CRUD
================================ */
function getVariantPayload() {
    return {
        model_id: document.getElementById("variantModelId").value,
        variant_name: document.getElementById("variantName").value.trim(),
        transmission: document.getElementById("variantTransmission").value.trim(),
        fuel_type: document.getElementById("variantFuelType").value.trim(),
        price_range: document.getElementById("variantPriceRange").value.trim(),
        status: document.getElementById("variantStatus").value
    };
}

async function saveVariant() {
    if (!canManageVehicles()) {
        toast("You do not have permission to save variants", true);
        return;
    }

    const id = document.getElementById("variantId").value;
    const payload = getVariantPayload();

    if (!payload.model_id || !payload.variant_name) {
        toast("Model and variant name are required", true);
        return;
    }

    const url = id ? `${API}/vehicles/variants/${id}` : `${API}/vehicles/variants`;
    const method = id ? "PUT" : "POST";

    try {
        await request(url, {
            method,
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast(id ? "Vehicle variant updated" : "Vehicle variant created");
        resetVariantForm();
        await loadVehicleData();

    } catch (err) {
        toast(err.message || "Variant save failed", true);
    }
}

function editVariant(variant) {
    document.getElementById("variantFormTitle").innerText = "Edit Vehicle Variant";
    document.getElementById("variantId").value = variant.id || "";
    document.getElementById("variantModelId").value = variant.model_id || "";
    document.getElementById("variantName").value = variant.variant_name || "";
    document.getElementById("variantTransmission").value = variant.transmission || "";
    document.getElementById("variantFuelType").value = variant.fuel_type || "";
    document.getElementById("variantPriceRange").value = variant.price_range || "";
    document.getElementById("variantStatus").value = variant.status || "ACTIVE";
    window.scrollTo({ top: 360, behavior: "smooth" });
}

function resetVariantForm() {
    document.getElementById("variantFormTitle").innerText = "Add Vehicle Variant";
    document.getElementById("variantId").value = "";
    document.getElementById("variantModelId").value = "";
    document.getElementById("variantName").value = "";
    document.getElementById("variantTransmission").value = "";
    document.getElementById("variantFuelType").value = "";
    document.getElementById("variantPriceRange").value = "";
    document.getElementById("variantStatus").value = "ACTIVE";
}

async function deactivateVariant(id) {
    if (!confirm("Deactivate this variant?")) return;

    try {
        await request(`${API}/vehicles/variants/${id}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        toast("Vehicle variant deactivated");
        await loadVehicleData();

    } catch (err) {
        toast(err.message || "Deactivate failed", true);
    }
}

/* ===============================
   COLOR CRUD
================================ */
function getColorPayload() {
    return {
        model_id: document.getElementById("colorModelId").value,
        color_name: document.getElementById("colorName").value.trim(),
        status: document.getElementById("colorStatus").value
    };
}

async function saveColor() {
    if (!canManageVehicles()) {
        toast("You do not have permission to save colors", true);
        return;
    }

    const id = document.getElementById("colorId").value;
    const payload = getColorPayload();

    if (!payload.model_id || !payload.color_name) {
        toast("Model and color name are required", true);
        return;
    }

    const url = id ? `${API}/vehicles/colors/${id}` : `${API}/vehicles/colors`;
    const method = id ? "PUT" : "POST";

    try {
        await request(url, {
            method,
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast(id ? "Vehicle color updated" : "Vehicle color created");
        resetColorForm();
        await loadVehicleData();

    } catch (err) {
        toast(err.message || "Color save failed", true);
    }
}

function editColor(color) {
    document.getElementById("colorFormTitle").innerText = "Edit Vehicle Color";
    document.getElementById("colorId").value = color.id || "";
    document.getElementById("colorModelId").value = color.model_id || "";
    document.getElementById("colorName").value = color.color_name || "";
    document.getElementById("colorStatus").value = color.status || "ACTIVE";
    window.scrollTo({ top: 720, behavior: "smooth" });
}

function resetColorForm() {
    document.getElementById("colorFormTitle").innerText = "Add Vehicle Color";
    document.getElementById("colorId").value = "";
    document.getElementById("colorModelId").value = "";
    document.getElementById("colorName").value = "";
    document.getElementById("colorStatus").value = "ACTIVE";
}

async function deactivateColor(id) {
    if (!confirm("Deactivate this color?")) return;

    try {
        await request(`${API}/vehicles/colors/${id}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        toast("Vehicle color deactivated");
        await loadVehicleData();

    } catch (err) {
        toast(err.message || "Deactivate failed", true);
    }
}

window.saveModel = saveModel;
window.editModel = editModel;
window.deactivateModel = deactivateModel;
window.resetModelForm = resetModelForm;

window.saveVariant = saveVariant;
window.editVariant = editVariant;
window.deactivateVariant = deactivateVariant;
window.resetVariantForm = resetVariantForm;

window.saveColor = saveColor;
window.editColor = editColor;
window.deactivateColor = deactivateColor;
window.resetColorForm = resetColorForm;

window.onload = async () => {
    if (!canManageVehicles()) {
        toast("You do not have permission to access Vehicle Master", true);
        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1200);
        return;
    }

    await loadVehicleData();
};