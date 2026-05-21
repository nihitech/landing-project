if (!token) window.location.href = "login.html";

async function loadVehicleStatus() {
    try {
        const category = document.getElementById("categoryFilter").value || "AD";
        const data = await request(`${API}/vehicle-intelligence/options?category=${encodeURIComponent(category)}`, {
            headers: authHeaders()
        });

        const tbody = document.getElementById("vehicleStatusTable");
        const models = data.models || [];

        if (!models.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No vehicle status found</td></tr>`;
            return;
        }

        tbody.innerHTML = models.map(model => `
            <tr>
                <td><strong>${safe(model)}</strong></td>
                <td>${(data.variants || []).slice(0, 12).map(v => `<small>${safe(v)}</small>`).join("") || "-"}</td>
                <td>${(data.fuels || []).map(f => `<span class="badge active">${safe(f)}</span>`).join(" ") || "-"}</td>
                <td>${(data.colors || []).slice(0, 12).map(c => `<small>${safe(c)}</small>`).join("") || "-"}</td>
            </tr>
        `).join("");
    } catch (err) {
        toast(err.message || "Failed to load vehicle status", true);
    }
}

window.loadVehicleStatus = loadVehicleStatus;
window.onload = loadVehicleStatus;
