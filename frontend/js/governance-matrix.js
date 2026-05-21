let matrix = {};
let me = {};
let approvals = [];

if (!token) window.location.href = "login.html";

async function loadGovernance() {
    try {
        [matrix, me, approvals] = await Promise.all([
            request(`${API}/governance/matrix`, { headers: authHeaders() }),
            request(`${API}/governance/me`, { headers: authHeaders() }),
            request(`${API}/governance/approval-requests`, { headers: authHeaders() })
        ]);

        renderMe();
        renderMatrix();
        renderApprovals();
    } catch (err) {
        toast(err.message || "Failed to load governance matrix", true);
    }
}

function renderMe() {
    document.getElementById("myAuthority").innerText = me.authority_level || "-";
    document.getElementById("myScope").innerText = me.data_scope || "-";
    document.getElementById("vehicleControl").innerText = me.can_modify_vehicle_master ? "Modify" : (me.can_view_vehicle_dashboard ? "View" : "Status");
    document.getElementById("orgControl").innerText = me.can_modify_organization ? "Modify" : "Restricted";
}

function shortList(items) {
    if (!items || !items.length) return "-";
    return items.slice(0, 5).map(x => `<small>${safe(x)}</small>`).join("");
}

function renderMatrix() {
    const box = document.getElementById("matrixGrid");
    if (!box) return;

    box.innerHTML = Object.entries(matrix).map(([key, row]) => `
        <div class="governance-card">
            <div class="governance-card-head">
                <strong>${safe(row.label || key)}</strong>
                <span>${safe(key)} • Rank ${safe(row.rank)}</span>
            </div>
            <div class="governance-columns">
                <div><b>View</b>${shortList(row.view)}</div>
                <div><b>Edit</b>${shortList(row.edit)}</div>
                <div><b>Approve</b>${shortList(row.approve)}</div>
                <div><b>Reports</b>${shortList(row.reports)}</div>
                <div><b>Blocked</b>${shortList(row.blocked)}</div>
            </div>
        </div>
    `).join("");
}

function renderApprovals() {
    const tbody = document.getElementById("approvalTable");
    if (!tbody) return;

    if (!approvals.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No approval requests found</td></tr>`;
        return;
    }

    tbody.innerHTML = approvals.map(row => `
        <tr>
            <td><strong>${safe(row.request_type)}</strong><small>${safe(row.entity_type || "")} #${safe(row.entity_id || "")}</small></td>
            <td>${safe(row.requested_by_name || "-")}<small>${fmtDate(row.created_at)}</small></td>
            <td><span class="badge ${String(row.request_status || "").toLowerCase()}">${safe(row.request_status)}</span></td>
            <td>${safe(row.reason || "-")}</td>
            <td>${row.request_status === "PENDING" ? `<button onclick="reviewRequest(${row.id}, 'APPROVED')" class="save-btn">Approve</button><button onclick="reviewRequest(${row.id}, 'REJECTED')" class="danger-btn">Reject</button>` : safe(row.approved_by_name || "-")}</td>
        </tr>
    `).join("");
}

async function reviewRequest(id, status) {
    const remarks = prompt(`${status} remarks`) || "";
    try {
        await request(`${API}/governance/approval-requests/${id}/review`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify({ request_status: status, approver_remarks: remarks })
        });
        toast(`Request ${status.toLowerCase()}`);
        await loadGovernance();
    } catch (err) {
        toast(err.message || "Review failed", true);
    }
}

window.loadGovernance = loadGovernance;
window.reviewRequest = reviewRequest;
window.onload = loadGovernance;
