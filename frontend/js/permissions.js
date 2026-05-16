let roles = [];
let permissions = [];
let selectedRolePermissions = [];

if (!token) {
    window.location.href = "login.html";
}

function isAdmin() {
    return isHigherAuthority ? isHigherAuthority(user?.role) : user?.role === "admin";
}

async function loadRoles() {
    try {
        roles = await request(`${API}/permissions/roles`, {
            headers: authHeaders()
        });

        renderRoles();

    } catch (err) {
        toast(err.message || "Failed to load roles", true);
    }
}

async function loadPermissions() {
    try {
        permissions = await request(`${API}/permissions/permissions`, {
            headers: authHeaders()
        });

        renderPermissionBox();

    } catch (err) {
        toast(err.message || "Failed to load permissions", true);
    }
}

function renderRoles() {
    const tbody = document.getElementById("roleTable");
    if (!tbody) return;

    if (!roles.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">No roles found</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = roles.map(role => `
        <tr>
            <td>
                <strong>${safe(role.role_name)}</strong>
                <small>ID: ${role.id}</small>
            </td>
            <td>${safe(role.role_code)}</td>
            <td>${safe(role.description || "-")}</td>
            <td>
                <span class="badge ${String(role.status || "ACTIVE").toLowerCase()}">
                    ${safe(role.status || "ACTIVE")}
                </span>
            </td>
            <td>
                <button onclick='editRole(${JSON.stringify(role)})' class="copy-btn">Edit</button>
                <button onclick="selectRolePermissions(${role.id})" class="save-btn">Permissions</button>
            </td>
        </tr>
    `).join("");
}

function getRolePayload() {
    return {
        role_name: document.getElementById("roleName").value.trim(),
        role_code: document.getElementById("roleCode").value.trim(),
        description: document.getElementById("roleDescription").value.trim(),
        status: document.getElementById("roleStatus").value
    };
}

async function saveRole() {
    if (!isAdmin()) {
        toast("Only admin can save roles", true);
        return;
    }

    const id = document.getElementById("roleId").value;
    const payload = getRolePayload();

    if (!payload.role_name || !payload.role_code) {
        toast("Role name and role code are required", true);
        return;
    }

    const url = id
        ? `${API}/permissions/roles/${id}`
        : `${API}/permissions/roles`;

    const method = id ? "PUT" : "POST";

    try {
        await request(url, {
            method,
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast(id ? "Role updated" : "Role created");
        resetRoleForm();
        await loadRoles();

    } catch (err) {
        toast(err.message || "Role save failed", true);
    }
}

function editRole(role) {
    document.getElementById("roleFormTitle").innerText = "Edit Role";
    document.getElementById("roleId").value = role.id || "";

    document.getElementById("roleName").value = role.role_name || "";
    document.getElementById("roleCode").value = role.role_code || "";
    document.getElementById("roleDescription").value = role.description || "";
    document.getElementById("roleStatus").value = role.status || "ACTIVE";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function resetRoleForm() {
    document.getElementById("roleFormTitle").innerText = "Add New Role";
    document.getElementById("roleId").value = "";

    document.getElementById("roleName").value = "";
    document.getElementById("roleCode").value = "";
    document.getElementById("roleDescription").value = "";
    document.getElementById("roleStatus").value = "ACTIVE";
}

async function selectRolePermissions(roleId) {
    const role = roles.find(r => Number(r.id) === Number(roleId));
    if (!role) {
        toast("Role not found", true);
        return;
    }

    document.getElementById("selectedPermissionRoleId").value = roleId;
    document.getElementById("permissionTitle").innerText =
        `Permissions for ${role.role_name}`;

    try {
        selectedRolePermissions = await request(
            `${API}/permissions/roles/${roleId}/permissions`,
            { headers: authHeaders() }
        );

        renderPermissionBox();

    } catch (err) {
        toast(err.message || "Failed to load role permissions", true);
    }
}

function renderPermissionBox() {
    const box = document.getElementById("permissionBox");
    if (!box) return;

    if (!permissions.length) {
        box.innerHTML = `<div class="empty-state">No permissions found</div>`;
        return;
    }

    const selectedIds = selectedRolePermissions.map(p => Number(p.id));

    const grouped = permissions.reduce((acc, permission) => {
        const moduleName = permission.module_name || "General";
        if (!acc[moduleName]) acc[moduleName] = [];
        acc[moduleName].push(permission);
        return acc;
    }, {});

    box.innerHTML = Object.entries(grouped).map(([moduleName, perms]) => `
        <div class="table-card permission-module-card">
            <h3>${safe(moduleName)}</h3>

            ${perms.map(permission => `
                <label class="permission-item">
                    <input 
                        type="checkbox"
                        class="permission-checkbox"
                        value="${permission.id}"
                        ${selectedIds.includes(Number(permission.id)) ? "checked" : ""}
                    >
                    <span>
                        <strong>${safe(permission.permission_name)}</strong>
                        <small>${safe(permission.permission_code)}</small>
                    </span>
                </label>
            `).join("")}
        </div>
    `).join("");
}

async function saveRolePermissions() {
    const roleId = document.getElementById("selectedPermissionRoleId").value;

    if (!roleId) {
        toast("Please select a role first", true);
        return;
    }

    const permissionIds = [...document.querySelectorAll(".permission-checkbox:checked")]
        .map(input => Number(input.value));

    try {
        await request(`${API}/permissions/roles/${roleId}/permissions`, {
            method: "PUT",
            headers: authHeaders(true),
            body: JSON.stringify({
                permission_ids: permissionIds
            })
        });

        toast("Role permissions updated");

        selectedRolePermissions = await request(
            `${API}/permissions/roles/${roleId}/permissions`,
            { headers: authHeaders() }
        );

        renderPermissionBox();

    } catch (err) {
        toast(err.message || "Permission update failed", true);
    }
}

window.saveRole = saveRole;
window.editRole = editRole;
window.resetRoleForm = resetRoleForm;
window.selectRolePermissions = selectRolePermissions;
window.saveRolePermissions = saveRolePermissions;

window.onload = async () => {
    if (!isAdmin()) {
        toast("Only admin can access Permission Management", true);
        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1200);
        return;
    }

    await loadRoles();
    await loadPermissions();
};