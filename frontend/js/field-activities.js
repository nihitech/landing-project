let activities = [];
let branches = [];
let users = [];

if (!token) {
    window.location.href = "login.html";
}

function value(id) { return document.getElementById(id)?.value || ""; }
function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val || ""; }

function dateOnly(value) {
    if (!value) return "-";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-IN");
}

function badge(status) {
    const cls = String(status || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `<span class="badge ${cls}">${safe(status || "-")}</span>`;
}

async function loadMasters() {
    try {
        const [branchData, userData] = await Promise.all([
            request(`${API}/branches`, { headers: authHeaders() }),
            request(`${API}/auth/users`, { headers: authHeaders() })
        ]);

        branches = branchData || [];
        users = userData || [];

        document.getElementById("branchId").innerHTML =
            `<option value="">Select Branch</option>` +
            branches.map(b => `<option value="${b.id}">${safe(b.branch_name)} ${b.branch_code ? `(${safe(b.branch_code)})` : ""}</option>`).join("");

        document.getElementById("assignedUsers").innerHTML =
            users.filter(u => String(u.status || "ACTIVE").toUpperCase() !== "INACTIVE")
                .map(u => `<option value="${u.id}">${safe(u.name || u.email)} - ${safe(u.role || "")}</option>`)
                .join("");
    } catch (err) {
        toast(err.message || "Failed to load masters", true);
    }
}

function buildQuery() {
    const params = new URLSearchParams();
    if (value("activitySearch").trim()) params.set("search", value("activitySearch").trim());
    if (value("statusFilter")) params.set("status", value("statusFilter"));
    if (value("typeFilter")) params.set("activity_type", value("typeFilter"));
    return params.toString();
}

async function loadSummary() {
    try {
        const s = await request(`${API}/field-activities/summary/dashboard`, { headers: authHeaders() });
        document.getElementById("totalActivities").innerText = Number(s.total_activities || 0);
        document.getElementById("activeActivities").innerText = Number(s.active_activities || 0);
        document.getElementById("plannedActivities").innerText = Number(s.planned_activities || 0);
        document.getElementById("completedActivities").innerText = Number(s.completed_activities || 0);
        document.getElementById("todayChecks").innerText = Number(s.today_checks || 0);
        document.getElementById("outsideRangeChecks").innerText = Number(s.outside_range_checks || 0);
    } catch (err) {
        console.error("Field summary failed:", err.message);
    }
}

async function loadActivities() {
    try {
        const query = buildQuery();
        activities = await request(`${API}/field-activities${query ? `?${query}` : ""}`, { headers: authHeaders() });
        renderActivities();
        await loadSummary();
    } catch (err) {
        toast(err.message || "Failed to load field activities", true);
    }
}

function renderActivities() {
    const tbody = document.getElementById("activityTable");
    if (!tbody) return;

    if (!activities.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No field activities found</td></tr>`;
        return;
    }

    tbody.innerHTML = activities.map(row => `
        <tr>
            <td><strong>${safe(row.activity_name)}</strong><small>${safe(row.description || "")}</small></td>
            <td>${safe(row.activity_type || "-")}<small>${safe(row.source_type || "")}</small></td>
            <td><strong>${safe(row.location_name || "-")}</strong><small>${safe(row.address || "")}</small><small>Branch: ${safe(row.branch_name || "-")}</small></td>
            <td><small>Allowed: ${Number(row.allowed_radius_meters || 0)}m</small><small>Warning: ${Number(row.warning_radius_meters || 0)}m</small><small>${safe(row.location_mode || "FIXED")}</small></td>
            <td>${dateOnly(row.activity_date)}<small>${row.start_time ? new Date(row.start_time).toLocaleTimeString("en-IN") : "-"}</small></td>
            <td>${Number(row.assigned_users_count || 0)}</td>
            <td>${Number(row.captured_leads_count || 0)}</td>
            <td>${badge(row.status)}</td>
            <td class="compact-actions">
                <button onclick='editActivity(${JSON.stringify(row)})' class="icon-btn view-btn" title="Edit">✏️</button>
                <button onclick="checkActivity(${row.id}, 'CHECK_IN')" class="icon-btn save-btn" title="Check In">📍</button>
                <button onclick="checkActivity(${row.id}, 'CHECK_OUT')" class="icon-btn verify-btn" title="Check Out">✅</button>
            </td>
        </tr>
    `).join("");
}

function openActivityModal() {
    resetActivityForm();
    document.getElementById("activityModal").classList.add("show");
}

function closeActivityModal() {
    document.getElementById("activityModal").classList.remove("show");
}

function selectedUsers() {
    return Array.from(document.getElementById("assignedUsers").selectedOptions || []).map(option => Number(option.value)).filter(Boolean);
}

function getPayload() {
    return {
        activity_name: value("activityName").trim(),
        activity_type: value("activityType"),
        source_type: value("sourceType").trim(),
        branch_id: value("branchId") || null,
        location_name: value("locationName").trim(),
        address: value("address").trim(),
        target_latitude: value("targetLatitude") || null,
        target_longitude: value("targetLongitude") || null,
        allowed_radius_meters: value("allowedRadius") || 800,
        warning_radius_meters: value("warningRadius") || 1500,
        location_mode: value("locationMode"),
        activity_date: value("activityDate") || null,
        start_time: value("startTime") || null,
        end_time: value("endTime") || null,
        expected_leads_count: value("expectedLeads") || 0,
        status: value("activityStatus"),
        description: value("description").trim(),
        assigned_user_ids: selectedUsers()
    };
}

async function saveActivity() {
    const payload = getPayload();

    if (!payload.activity_name) {
        toast("Activity name is required", true);
        return;
    }

    try {
        await request(`${API}/field-activities`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });
        toast("Field activity created");
        closeActivityModal();
        await loadActivities();
    } catch (err) {
        toast(err.message || "Save failed", true);
    }
}

function editActivity(row) {
    setValue("activityName", row.activity_name);
    setValue("activityType", row.activity_type);
    setValue("sourceType", row.source_type);
    setValue("branchId", row.branch_id);
    setValue("locationName", row.location_name);
    setValue("address", row.address);
    setValue("targetLatitude", row.target_latitude);
    setValue("targetLongitude", row.target_longitude);
    setValue("allowedRadius", row.allowed_radius_meters || 800);
    setValue("warningRadius", row.warning_radius_meters || 1500);
    setValue("locationMode", row.location_mode || "FIXED");
    setValue("activityStatus", row.status || "PLANNED");
    setValue("activityDate", row.activity_date ? String(row.activity_date).slice(0, 10) : "");
    setValue("expectedLeads", row.expected_leads_count || 0);
    setValue("description", row.description || "");
    document.getElementById("activityModalTitle").innerText = "Edit Field Activity";
    document.getElementById("activityModal").classList.add("show");
}

function resetActivityForm() {
    ["activityName", "sourceType", "branchId", "locationName", "address", "targetLatitude", "targetLongitude", "activityDate", "startTime", "endTime", "description"].forEach(id => setValue(id, ""));
    setValue("activityType", "STALL");
    setValue("allowedRadius", 800);
    setValue("warningRadius", 1500);
    setValue("locationMode", "FIXED");
    setValue("activityStatus", "PLANNED");
    setValue("expectedLeads", 0);
    document.getElementById("activityModalTitle").innerText = "Field Activity";
}

async function checkActivity(activityId, checkType) {
    if (!navigator.geolocation) {
        toast("GPS location is not supported in this browser", true);
        return;
    }

    toast("Getting current GPS location...");

    navigator.geolocation.getCurrentPosition(async position => {
        try {
            const result = await request(`${API}/field-activities/${activityId}/check`, {
                method: "POST",
                headers: authHeaders(true),
                body: JSON.stringify({
                    check_type: checkType,
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    device_info: navigator.userAgent
                })
            });

            toast(`${checkType.replace("_", " ")} saved. Status: ${result.validation_status}. Distance: ${result.distance_meters || "-"}m`);
            await loadActivities();
        } catch (err) {
            toast(err.message || "Check failed", true);
        }
    }, () => {
        toast("Unable to access GPS location. Please allow location permission.", true);
    }, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
    });
}

window.openActivityModal = openActivityModal;
window.closeActivityModal = closeActivityModal;
window.saveActivity = saveActivity;
window.editActivity = editActivity;
window.checkActivity = checkActivity;
window.loadActivities = loadActivities;

window.onload = async () => {
    await loadMasters();
    await loadActivities();
};
