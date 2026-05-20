/*
  NIKRION Vehicle Intelligence Binding
  Connects Vehicle Category -> Model -> Variant -> Fuel -> Color
*/

async function vehicleIntelFetch(path) {
    const res = await fetch(`${API}/vehicle-intelligence${path}`, {
        headers: typeof authHeaders === "function" ? authHeaders() : {}
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Vehicle intelligence failed");
    return data;
}

function asSelect(id, placeholder = "Select") {
    const el = document.getElementById(id);
    if (!el) return null;

    if (el.tagName.toLowerCase() === "select") return el;

    const select = document.createElement("select");
    select.id = el.id;
    select.className = el.className;
    select.name = el.name || el.id;
    select.innerHTML = `<option value="">${placeholder}</option>`;

    el.parentNode.replaceChild(select, el);
    return select;
}

function fillOptions(select, items, placeholder = "Select", keepValue = "") {
    if (!select) return;
    const oldValue = keepValue || select.value || "";
    select.innerHTML = `<option value="">${placeholder}</option>` +
        (items || []).map(item => `<option value="${String(item).replace(/"/g, "&quot;")}">${item}</option>`).join("");

    if (oldValue && [...select.options].some(o => o.value === oldValue)) {
        select.value = oldValue;
    }
}

function bindVehicleIntelligence(config) {
    const categoryEl = document.getElementById(config.category);
    const modelEl = asSelect(config.model, "Select Model");
    const variantEl = asSelect(config.variant, "Select Variant");
    const fuelEl = asSelect(config.fuel, "Select Fuel");
    const colorEl = asSelect(config.color, "Select Color");

    if (!categoryEl || !modelEl) return;

    async function loadModels() {
        try {
            fillOptions(modelEl, [], "Loading models...");
            fillOptions(variantEl, [], "Select Variant");
            fillOptions(fuelEl, [], "Select Fuel");
            fillOptions(colorEl, [], "Select Color");

            const models = await vehicleIntelFetch(`/models?category=${encodeURIComponent(categoryEl.value || "AD")}`);
            fillOptions(modelEl, models, "Select Model");
        } catch (err) {
            console.warn("Vehicle models failed:", err.message);
            fillOptions(modelEl, [], "No models found");
        }
    }

    async function loadVariants() {
        try {
            fillOptions(variantEl, [], "Loading variants...");
            fillOptions(fuelEl, [], "Select Fuel");
            fillOptions(colorEl, [], "Select Color");

            const variants = await vehicleIntelFetch(`/variants?category=${encodeURIComponent(categoryEl.value || "AD")}&model=${encodeURIComponent(modelEl.value || "")}`);
            fillOptions(variantEl, variants, "Select Variant");
        } catch (err) {
            console.warn("Vehicle variants failed:", err.message);
            fillOptions(variantEl, [], "No variants found");
        }
    }

    async function loadFuels() {
        try {
            fillOptions(fuelEl, [], "Loading fuel...");
            fillOptions(colorEl, [], "Select Color");

            const params = new URLSearchParams({
                category: categoryEl.value || "AD",
                model: modelEl.value || "",
                variant: variantEl.value || ""
            });
            const fuels = await vehicleIntelFetch(`/fuels?${params.toString()}`);
            fillOptions(fuelEl, fuels, "Select Fuel");

            if (fuels.length === 1) {
                fuelEl.value = fuels[0];
                await loadColors();
            }
        } catch (err) {
            console.warn("Vehicle fuels failed:", err.message);
            fillOptions(fuelEl, [], "No fuel found");
        }
    }

    async function loadColors() {
        try {
            fillOptions(colorEl, [], "Loading colors...");

            const params = new URLSearchParams({
                category: categoryEl.value || "AD",
                model: modelEl.value || "",
                variant: variantEl.value || "",
                fuel_type: fuelEl.value || ""
            });
            const colors = await vehicleIntelFetch(`/colors?${params.toString()}`);
            fillOptions(colorEl, colors, "Select Color");
        } catch (err) {
            console.warn("Vehicle colors failed:", err.message);
            fillOptions(colorEl, [], "No colors found");
        }
    }

    categoryEl.addEventListener("change", loadModels);
    modelEl.addEventListener("change", loadVariants);
    variantEl.addEventListener("change", loadFuels);
    fuelEl.addEventListener("change", loadColors);

    loadModels();
}

window.bindVehicleIntelligence = bindVehicleIntelligence;
