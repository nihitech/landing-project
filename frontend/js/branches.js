let branches = [];
let managers = [];

if (!token) {
    window.location.href = "login.html";
}

function isAdmin() {
    return isHigherAuthority ? isHigherAuthority(user?.role) : user?.role === "admin";
}

async function loadManagers() {
    try {
        const users = await request(`${API}/auth/users`, {
            headers: authHeaders()
        });

        managers = users.filter(u =>
            ["admin", "manager", "team_leader", "branch_manager"].includes(
                String(u.role || "").toLowerCase()
            )
        );

        const select = document.getElementById("managerId");
        if (!select) return;

        select.innerHTML = `<option value="">Select Manager</option>` +
            managers.map(u => `
                <option value="${u.id}">
                    ${safe(u.name)} (${safe(u.role || "user")})
                </option>
            `).join("");

    } catch (err) {
        console.error("Load managers failed:", err.message);
    }
}

async function loadBranches() {
    try {
        branches = await request(`${API}/branches`, {
            headers: authHeaders()
        });

        renderBranches();

    } catch (err) {
        toast(err.message || "Failed to load branches", true);
    }
}

function renderBranches() {
    const tbody = document.getElementById("branchTable");
    if (!tbody) return;

    if (!branches.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">No branches found</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = branches.map(branch => `
        <tr>
            <td>
                <strong>${safe(branch.branch_name)}</strong>
                <small>ID: ${branch.id}</small>
            </td>
            <td>${safe(branch.branch_code)}</td>
            <td>
                ${safe(branch.area || "-")}, ${safe(branch.city || "-")}
                <small>${safe(branch.district || "-")} - ${safe(branch.pincode || "-")}</small>
            </td>
            <td>${safe(branch.manager_name || "-")}</td>
            <td>
                ${safe(branch.phone || "-")}
                <small>${safe(branch.email || "-")}</small>
            </td>
            <td>
                <span class="badge ${String(branch.status || "ACTIVE").toLowerCase()}">
                    ${safe(branch.status || "ACTIVE")}
                </span>
            </td>
            <td>
                <button onclick='editBranch(${JSON.stringify(branch)})' class="copy-btn">Edit</button>
                <button onclick="deactivateBranch(${branch.id})" class="danger-btn">Deactivate</button>
            </td>
        </tr>
    `).join("");
}

function getBranchPayload() {
    return {
        branch_name: document.getElementById("branchName").value.trim(),
        branch_code: document.getElementById("branchCode").value.trim(),
        manager_id: document.getElementById("managerId").value || null,
        phone: document.getElementById("branchPhone").value.trim(),
        email: document.getElementById("branchEmail").value.trim(),
        status: document.getElementById("branchStatus").value,
        address: document.getElementById("branchAddress").value.trim(),
        area: document.getElementById("branchArea").value.trim(),
        city: document.getElementById("branchCity").value.trim(),
        district: document.getElementById("branchDistrict").value.trim(),
        state: document.getElementById("branchState").value.trim(),
        pincode: document.getElementById("branchPincode").value.trim(),
        latitude: document.getElementById("branchLatitude").value.trim(),
        longitude: document.getElementById("branchLongitude").value.trim()
    };
}

async function saveBranch() {
    if (!isAdmin()) {
        toast("Only admin can save branch", true);
        return;
    }

    const id = document.getElementById("branchId").value;
    const payload = getBranchPayload();

    if (!payload.branch_name || !payload.branch_code) {
        toast("Branch name and branch code are required", true);
        return;
    }

    const url = id ? `${API}/branches/${id}` : `${API}/branches`;
    const method = id ? "PUT" : "POST";

    try {
        await request(url, {
            method,
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast(id ? "Branch updated" : "Branch created");
        resetBranchForm();
        await loadBranches();

    } catch (err) {
        toast(err.message || "Branch save failed", true);
    }
}

function editBranch(branch) {
    document.getElementById("branchFormTitle").innerText = "Edit Branch";
    document.getElementById("branchId").value = branch.id || "";

    document.getElementById("branchName").value = branch.branch_name || "";
    document.getElementById("branchCode").value = branch.branch_code || "";
    document.getElementById("managerId").value = branch.manager_id || "";
    document.getElementById("branchPhone").value = branch.phone || "";
    document.getElementById("branchEmail").value = branch.email || "";
    document.getElementById("branchStatus").value = branch.status || "ACTIVE";

    document.getElementById("branchAddress").value = branch.address || "";
    document.getElementById("branchArea").value = branch.area || "";
    document.getElementById("branchCity").value = branch.city || "";
    document.getElementById("branchDistrict").value = branch.district || "";
    document.getElementById("branchState").value = branch.state || "";
    document.getElementById("branchPincode").value = branch.pincode || "";
    document.getElementById("branchLatitude").value = branch.latitude || "";
    document.getElementById("branchLongitude").value = branch.longitude || "";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function resetBranchForm() {
    document.getElementById("branchFormTitle").innerText = "Add New Branch";
    document.getElementById("branchId").value = "";

    [
        "branchName",
        "branchCode",
        "branchPhone",
        "branchEmail",
        "branchAddress",
        "branchArea",
        "branchCity",
        "branchDistrict",
        "branchState",
        "branchPincode",
        "branchLatitude",
        "branchLongitude"
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    document.getElementById("managerId").value = "";
    document.getElementById("branchStatus").value = "ACTIVE";
}

async function deactivateBranch(id) {
    if (!isAdmin()) {
        toast("Only admin can deactivate branch", true);
        return;
    }

    if (!confirm("Deactivate this branch?")) return;

    try {
        await request(`${API}/branches/${id}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        toast("Branch deactivated");
        await loadBranches();

    } catch (err) {
        toast(err.message || "Deactivate failed", true);
    }
}

window.saveBranch = saveBranch;
window.editBranch = editBranch;
window.deactivateBranch = deactivateBranch;
window.resetBranchForm = resetBranchForm;

window.onload = async () => {
    if (!isAdmin()) {
        toast("Only admin can access Branch Management", true);
        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1200);
        return;
    }

    await loadManagers();
    await loadBranches();
};