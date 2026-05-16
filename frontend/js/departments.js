let departments = [];

if (!token) {
    window.location.href = "login.html";
}

function isAdmin() {
    return isHigherAuthority ? isHigherAuthority(user?.role) : user?.role === "admin";
}

async function loadDepartments() {
    try {
        departments = await request(`${API}/departments`, {
            headers: authHeaders()
        });

        renderDepartments();

    } catch (err) {
        toast(err.message || "Failed to load departments", true);
    }
}

function renderDepartments() {
    const tbody = document.getElementById("departmentTable");
    if (!tbody) return;

    if (!departments.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">No departments found</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = departments.map(dept => `
        <tr>
            <td>
                <strong>${safe(dept.department_name)}</strong>
                <small>ID: ${dept.id}</small>
            </td>
            <td>${safe(dept.department_code)}</td>
            <td>${safe(dept.description || "-")}</td>
            <td>
                <span class="badge ${String(dept.status || "ACTIVE").toLowerCase()}">
                    ${safe(dept.status || "ACTIVE")}
                </span>
            </td>
            <td>
                <button onclick='editDepartment(${JSON.stringify(dept)})' class="copy-btn">Edit</button>
                <button onclick="deactivateDepartment(${dept.id})" class="danger-btn">Deactivate</button>
            </td>
        </tr>
    `).join("");
}

function getDepartmentPayload() {
    return {
        department_name: document.getElementById("departmentName").value.trim(),
        department_code: document.getElementById("departmentCode").value.trim(),
        description: document.getElementById("departmentDescription").value.trim(),
        status: document.getElementById("departmentStatus").value
    };
}

async function saveDepartment() {
    if (!isAdmin()) {
        toast("Only admin can save department", true);
        return;
    }

    const id = document.getElementById("departmentId").value;
    const payload = getDepartmentPayload();

    if (!payload.department_name || !payload.department_code) {
        toast("Department name and code are required", true);
        return;
    }

    const url = id ? `${API}/departments/${id}` : `${API}/departments`;
    const method = id ? "PUT" : "POST";

    try {
        await request(url, {
            method,
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast(id ? "Department updated" : "Department created");
        resetDepartmentForm();
        await loadDepartments();

    } catch (err) {
        toast(err.message || "Department save failed", true);
    }
}

function editDepartment(dept) {
    document.getElementById("departmentFormTitle").innerText = "Edit Department";
    document.getElementById("departmentId").value = dept.id || "";

    document.getElementById("departmentName").value = dept.department_name || "";
    document.getElementById("departmentCode").value = dept.department_code || "";
    document.getElementById("departmentDescription").value = dept.description || "";
    document.getElementById("departmentStatus").value = dept.status || "ACTIVE";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function resetDepartmentForm() {
    document.getElementById("departmentFormTitle").innerText = "Add New Department";
    document.getElementById("departmentId").value = "";

    document.getElementById("departmentName").value = "";
    document.getElementById("departmentCode").value = "";
    document.getElementById("departmentDescription").value = "";
    document.getElementById("departmentStatus").value = "ACTIVE";
}

async function deactivateDepartment(id) {
    if (!isAdmin()) {
        toast("Only admin can deactivate department", true);
        return;
    }

    if (!confirm("Deactivate this department?")) return;

    try {
        await request(`${API}/departments/${id}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        toast("Department deactivated");
        await loadDepartments();

    } catch (err) {
        toast(err.message || "Deactivate failed", true);
    }
}

window.saveDepartment = saveDepartment;
window.editDepartment = editDepartment;
window.deactivateDepartment = deactivateDepartment;
window.resetDepartmentForm = resetDepartmentForm;

window.onload = async () => {
    if (!isAdmin()) {
        toast("Only admin can access Department Management", true);
        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1200);
        return;
    }

    await loadDepartments();
};