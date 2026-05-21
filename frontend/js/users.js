let users = [];
let departments = [];
let branches = [];
let roles = [];

const ROLE_PERMISSION_PRESETS = {
    admin: {
        role: "admin",
        data_scope: "ALL",
        flags: { can_view: true, can_create: true, can_edit: true, can_assign: true, can_delete: true, can_export: true, can_monitor: true },
        dashboards: ["dashboard","manager-dashboard","receptionist-dashboard","sales-dashboard","telecaller-dashboard","field-dashboard","finance-dashboard","service-dashboard","marketing-dashboard","leads","quick-enquiries","showroom-qr","activity","reports","bookings","delivery","vehicles","stock","inventory","branches","users"]
    },
    branch_manager: {
        role: "branch_manager",
        data_scope: "BRANCH",
        flags: { can_view: true, can_create: true, can_edit: true, can_assign: true, can_delete: false, can_export: true, can_monitor: true },
        dashboards: ["manager-dashboard","dashboard","leads","quick-enquiries","showroom-qr","activity","reports","bookings","delivery"]
    },
    sales: {
        role: "sales",
        data_scope: "OWN",
        flags: { can_view: true, can_create: true, can_edit: true, can_assign: false, can_delete: false, can_export: false, can_monitor: false },
        dashboards: ["sales-dashboard","leads","quick-enquiries","bookings"]
    },
    telecaller: {
        role: "telecaller",
        data_scope: "BRANCH",
        flags: { can_view: true, can_create: true, can_edit: true, can_assign: false, can_delete: false, can_export: false, can_monitor: false },
        dashboards: ["telecaller-dashboard","quick-enquiries","leads","showroom-qr"]
    },
    receptionist: {
        role: "telecaller",
        data_scope: "BRANCH",
        flags: { can_view: true, can_create: true, can_edit: true, can_assign: true, can_delete: false, can_export: false, can_monitor: false },
        dashboards: ["receptionist-dashboard","showroom-qr","leads","quick-enquiries"]
    },
    field: {
        role: "field",
        data_scope: "OWN",
        flags: { can_view: true, can_create: true, can_edit: true, can_assign: false, can_delete: false, can_export: false, can_monitor: false },
        dashboards: ["field-dashboard","quick-enquiries","leads"]
    },
    finance: {
        role: "finance",
        data_scope: "BRANCH",
        flags: { can_view: true, can_create: true, can_edit: true, can_assign: false, can_delete: false, can_export: true, can_monitor: false },
        dashboards: ["finance-dashboard","bookings","leads","reports"]
    },
    service: {
        role: "service",
        data_scope: "BRANCH",
        flags: { can_view: true, can_create: true, can_edit: true, can_assign: false, can_delete: false, can_export: true, can_monitor: false },
        dashboards: ["service-dashboard","delivery","leads","reports"]
    },
    marketing: {
        role: "marketing",
        data_scope: "BRANCH",
        flags: { can_view: true, can_create: true, can_edit: true, can_assign: false, can_delete: false, can_export: true, can_monitor: true },
        dashboards: ["marketing-dashboard","leads","reports"]
    },
    view_only: {
        role: "view_only",
        data_scope: "VIEW_ONLY",
        flags: { can_view: true, can_create: false, can_edit: false, can_assign: false, can_delete: false, can_export: false, can_monitor: false },
        dashboards: ["sales-dashboard","leads"]
    }
};

function getDashboardAccess() {
    return [...document.querySelectorAll(".dashboard-access:checked")].map(el => el.value);
}

function setDashboardAccess(values = []) {
    const allowed = new Set(Array.isArray(values) ? values : []);
    document.querySelectorAll(".dashboard-access").forEach(el => {
        el.checked = allowed.has(el.value);
    });
}

function applyPermissionPreset(key) {
    const preset = ROLE_PERMISSION_PRESETS[key];
    if (!preset) return;

    setValue("urole", preset.role);
    setValue("u_data_scope", preset.data_scope);

    Object.entries(preset.flags).forEach(([id, checked]) => setCheckbox(id, checked));
    setDashboardAccess(preset.dashboards);

    toast("Permission preset applied");
}



function checkbox(id) {
    return document.getElementById(id)?.checked === true;
}

function setCheckbox(id, value) {
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

async function loadDepartmentsAndBranches() {
    try {
        departments = await request(`${API}/auth/departments`, {
            headers: authHeaders()
        });
    } catch (e) {
        departments = [];
    }

    try {
        branches = await request(`${API}/auth/branches`, {
            headers: authHeaders()
        });
    } catch (e) {
        branches = [];
    }

    renderDepartmentOptions();
    renderBranchOptions();
}

function renderDepartmentOptions() {
    const select = document.getElementById("u_department");
    if (!select) return;

    select.innerHTML = `<option value="">Select Department</option>` + departments.map(d => `
        <option value="${d.id}">${safe(d.name)} (${safe(d.code)})</option>
    `).join("");
}

function renderBranchOptions() {
    const select = document.getElementById("u_branch");
    if (!select) return;

    select.innerHTML = `<option value="">Select Branch</option>` + branches.map(b => `
        <option value="${b.id}">${safe(b.branch_name)} (${safe(b.branch_code || "-")})</option>
    `).join("");
}

async function loadRoles() {
    try {
        roles = await request(`${API}/permissions/roles`, {
            headers: authHeaders()
        });
    } catch (e) {
        roles = [
            { role_name: "Admin", role_code: "admin" },
            { role_name: "Manager", role_code: "manager" },
            { role_name: "Team Leader", role_code: "team_leader" },
            { role_name: "Sales", role_code: "sales" },
            { role_name: "Telecaller", role_code: "telecaller" },
            { role_name: "Marketing", role_code: "marketing" },
            { role_name: "Field Executive", role_code: "field" },
            { role_name: "Finance", role_code: "finance" },
            { role_name: "Service", role_code: "service" },
            { role_name: "View Only", role_code: "view_only" }
        ];
    }

    renderRoleOptions();
}

function renderRoleOptions() {
    const select = document.getElementById("urole");
    if (!select) return;

    const current = select.value || "";

    select.innerHTML = `<option value="">Select Role</option>` + roles
        .filter(r => String(r.status || "ACTIVE").toUpperCase() === "ACTIVE")
        .map(r => `
            <option value="${safe(r.role_code)}">${safe(r.role_name)} (${safe(r.role_code)})</option>
        `).join("");

    if (current) select.value = current;
}

function renderManagerOptions() {
    const select = document.getElementById("u_manager");
    if (!select) return;

    const managerRoles = ["admin", "manager", "sales", "telecaller", "marketing", "field", "finance", "service"];

    select.innerHTML = `<option value="">Reporting Manager</option>` + users
        .filter(u => managerRoles.includes(String(u.role || "").toLowerCase()))
        .map(u => `
            <option value="${u.id}">
                ${safe(u.name)} - ${safe(u.role)}
            </option>
        `).join("");
}

async function loadPage() {
    requireAdminPage();

    await loadDepartmentsAndBranches();
    await loadRoles();

    users = await request(`${API}/auth/users`, {
        headers: authHeaders()
    });

    renderManagerOptions();
    renderUsersTable();
}

function renderUsersTable() {
    const tbody = document.querySelector("#userTable tbody");
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No users</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(u => {
        const isMe = Number(u.id) === Number(user.id);

        return `
            <tr>
                <td>
                    <strong>${safe(u.name)}</strong>
                    <small>Code: ${safe(u.user_code || "-")}</small>
                    <small>${safe(u.designation || "-")}</small>
                </td>

                <td>
                    ${safe(u.email)}
                    <small>${safe(u.phone || "-")}</small>
                </td>

                <td>
                    ${safe(u.department_name || "-")}
                    <small>${safe(u.department_code || "-")}</small>
                </td>

                <td>
                    ${safe(u.branch_name || "-")}
                    <small>${safe(u.branch_code || "-")}</small>
                </td>

                <td>
                    <span class="role-pill">${safe(u.role)}</span>
                    <small>Scope: ${safe(u.data_scope || "OWN")}</small>
                    <small>Vehicle Scope: ${safe(u.vehicle_category_scope || "ALL")}</small>
                    <small>Manager: ${safe(u.manager_name || "-")}</small>
                </td>

                <td>
                    <div class="permission-mini">
                        ${u.can_view ? "<span>View</span>" : ""}
                        ${u.can_create ? "<span>Create</span>" : ""}
                        ${u.can_edit ? "<span>Edit</span>" : ""}
                        ${u.can_assign ? "<span>Assign</span>" : ""}
                        ${u.can_delete ? "<span>Delete</span>" : ""}
                        ${u.can_export ? "<span>Export</span>" : ""}
                        ${u.can_monitor ? "<span>Monitor</span>" : ""}
                    </div>
                </td>

                <td>
                    <span class="status-pill ${String(u.status || "ACTIVE").toLowerCase()}">
                        ${safe(u.status || "ACTIVE")}
                    </span>
                </td>

                <td>
                    <button onclick="editUser(${u.id})" class="view-btn">Edit</button>
                    <button onclick="deleteUser(${u.id})" class="delete-user-btn" ${isMe ? "disabled" : ""}>
                        Delete
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

function buildUserPayload(isEdit = false) {
    const payload = {
        user_code: value("u_user_code").trim(),
        name: value("uname").trim(),
        email: value("uemail").trim(),
        phone: value("uphone").trim(),
        role: value("urole") || "sales",
        department_id: value("u_department") || null,
        branch_id: value("u_branch") || null,
        designation: value("u_designation").trim(),
        manager_id: value("u_manager") || null,
        data_scope: value("u_data_scope"),
        status: value("u_status") || "ACTIVE",
        vehicle_category_scope: value("vehicleCategoryScope") || "ALL",

        can_view: checkbox("can_view"),
        can_create: checkbox("can_create"),
        can_edit: checkbox("can_edit"),
        can_assign: checkbox("can_assign"),
        can_delete: checkbox("can_delete"),
        can_export: checkbox("can_export"),
        can_monitor: checkbox("can_monitor"),
        dashboard_access: getDashboardAccess()
    };

    if (!isEdit) {
        payload.password = value("upassword").trim();
    }

    return payload;
}

async function saveUser() {
    const editId = value("editUserId");
    const isEdit = Boolean(editId);

    const payload = buildUserPayload(isEdit);

    if (!payload.name || !payload.email) {
        return toast("Name and email are required", true);
    }

    if (!isEdit && !payload.password) {
        return toast("Password is required", true);
    }

    try {
        if (isEdit) {
            await request(`${API}/auth/user/${editId}`, {
                method: "PUT",
                headers: authHeaders(true),
                body: JSON.stringify(payload)
            });

            toast("User updated");
        } else {
            await request(`${API}/auth/register`, {
                method: "POST",
                headers: authHeaders(true),
                body: JSON.stringify(payload)
            });

            toast("User added");
        }

        resetUserForm();
        await loadPage();

    } catch (e) {
        toast(e.message, true);
    }
}

function editUser(id) {
    const u = users.find(x => Number(x.id) === Number(id));
    if (!u) return toast("User not found", true);

    setValue("editUserId", u.id);
    setValue("u_user_code", u.user_code || "");
    setValue("uname", u.name || "");
    setValue("uemail", u.email || "");
    setValue("uphone", u.phone || "");
    setValue("upassword", "");

    const emailInput = document.getElementById("uemail");
    if (emailInput) emailInput.disabled = true;

    setValue("urole", u.role || "sales");
    setValue("u_department", u.department_id || "");
    setValue("u_branch", u.branch_id || "");
    setValue("u_designation", u.designation || "");
    setValue("u_manager", u.manager_id || "");
    setValue("u_data_scope", u.data_scope || "OWN");
    setValue("u_status", u.status || "ACTIVE");
    setValue("vehicleCategoryScope", u.vehicle_category_scope || "ALL");

    setCheckbox("can_view", u.can_view !== false);
    setCheckbox("can_create", u.can_create === true);
    setCheckbox("can_edit", u.can_edit === true);
    setCheckbox("can_assign", u.can_assign === true);
    setCheckbox("can_delete", u.can_delete === true);
    setCheckbox("can_export", u.can_export === true);
    setCheckbox("can_monitor", u.can_monitor === true);
    setDashboardAccess(Array.isArray(u.dashboard_access) ? u.dashboard_access : []);

    document.getElementById("userFormTitle").innerText = "Edit User";
    document.getElementById("saveUserBtn").innerText = "Update User";
    document.getElementById("cancelEditBtn").style.display = "inline-block";

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetUserForm() {
    [
        "editUserId",
        "u_user_code",
        "uname",
        "uemail",
        "uphone",
        "upassword",
        "u_designation"
    ].forEach(id => setValue(id, ""));

    setValue("urole", "sales");
    setValue("u_department", "");
    setValue("u_branch", "");
    setValue("u_manager", "");
    setValue("u_data_scope", "OWN");
    setValue("u_status", "ACTIVE");
    setValue("vehicleCategoryScope", "ALL");

    setCheckbox("can_view", true);
    setCheckbox("can_create", false);
    setCheckbox("can_edit", false);
    setCheckbox("can_assign", false);
    setCheckbox("can_delete", false);
    setCheckbox("can_export", false);
    setCheckbox("can_monitor", false);
    setDashboardAccess(ROLE_PERMISSION_PRESETS.sales.dashboards);

    const emailInput = document.getElementById("uemail");
    if (emailInput) emailInput.disabled = false;

    document.getElementById("userFormTitle").innerText = "Add User";
    document.getElementById("saveUserBtn").innerText = "Add User";
    document.getElementById("cancelEditBtn").style.display = "none";
}

async function deleteUser(id) {
    if (!confirm("Delete this user? Assigned leads will become unassigned.")) return;

    try {
        await request(`${API}/auth/user/${id}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        toast("User deleted");
        await loadPage();

    } catch (e) {
        toast(e.message, true);
    }
}

window.onload = () => loadPage().catch(e => toast(e.message, true));
window.applyPermissionPreset = applyPermissionPreset;
