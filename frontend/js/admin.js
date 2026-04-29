let users = [];
let priorityChart, actionChart;

const API = "https://landing-backend-8gvq.onrender.com/api";
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "{}");

if (!token) {
    window.location.href = "login.html";
}
async function loadUsers() {
    try {
        const res = await fetch(`${API}/auth/users`, {
            headers: { Authorization: token }
        });

        if (res.status === 401) return logout();

        users = await res.json();
        console.log("Users:", users);

    } catch (e) {
        console.error("Users load error:", e);
    }
}
async function assignLead(id, userId) {
    try {
        await fetch(`${API}/lead/${id}/assign`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: token
            },
            body: JSON.stringify({ user_id: userId })
        });

        console.log("Assigned:", id, userId);

    } catch (e) {
        console.error("Assign error:", e);
    }
}
async function saveNotes(id, notes) {
    try {
        await fetch(`${API}/lead/${id}/notes`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: token
            },
            body: JSON.stringify({ notes })
        });

        console.log("Notes saved:", id);

    } catch (error) {
        console.error("Notes error:", error);
    }
}

function renderPipeline(leads) {

    const zones = {
        new: document.getElementById("new"),
        contacted: document.getElementById("contacted"),
        followup: document.getElementById("followup"),
        closed: document.getElementById("closedZone")
    };

    Object.values(zones).forEach(z => {
    if (z) z.innerHTML = "";
});

    const statusMap = {
        "NEW": "new",
        "CONTACTED": "contacted",
        "FOLLOW-UP": "followup",
        "CLOSED": "closed"
    };
    const counters = {
        new: 0,
        contacted: 0,
        followup: 0,
        closed: 0
    };

    leads.forEach(lead => {

        const normalizedStatus = (lead.status || "NEW").toUpperCase();
        const statusMap = {
            "NEW": "new",
            "CONTACTED": "contacted",
            "FOLLOW-UP": "followup",
            "CLOSED": "closed"
        };
        const statusKey = statusMap[normalizedStatus] || "new";
        counters[statusKey]++;

        const card = document.createElement("div");
        card.className = `lead-card ${(lead.priority || "COLD").toLowerCase()}`;
        card.draggable = true;

        card.innerHTML = `
            <strong>${lead.name}</strong>
            <div class="lead-meta">${lead.phone}</div>
            <div class="lead-meta">${lead.car_interest || ""}</div>
            <div class="lead-meta">
                ${lead.assigned_name || "Unassigned"}
            </div>
        `;

        card.dataset.id = lead.id;

        card.addEventListener("dragstart", e => {
            e.dataTransfer.setData("id", lead.id);
        });

        zones[statusKey]?.appendChild(card);
    });

    // ADD COUNTS TO HEADER
    document.querySelector('[data-status="NEW"] h3').innerText = `NEW (${counters.new})`;
    document.querySelector('[data-status="CONTACTED"] h3').innerText = `CONTACTED (${counters.contacted})`;
    document.querySelector('[data-status="FOLLOW-UP"] h3').innerText = `FOLLOW-UP (${counters.followup})`;
    document.querySelector('[data-status="CLOSED"] h3').innerText = `CLOSED (${counters.closed})`;
}

function initDragDrop() {
    document.querySelectorAll(".dropzone").forEach(zone => {

        zone.addEventListener("dragover", e => e.preventDefault());

        zone.addEventListener("drop", async e => {
            e.preventDefault();

            const id = e.dataTransfer.getData("id");
            const status = zone.parentElement.dataset.status;

            await updateStatus(id, status);
            loadLeads();
        });
    });
}// 🚀 LOAD LEADS TABLE
async function loadLeads() {
    try {
        const filterElement = document.getElementById("filter");
        const searchElement = document.getElementById("searchInput");

        const filter = filterElement ? filterElement.value : "";
        const search = searchElement ? searchElement.value.toLowerCase() : "";

        const res = await fetch(`${API}/leads`, {
            headers: {
                Authorization: token
            }
        });
        if (res.status === 401) {
            logout();
            return;
        }
        const data = await res.json();
        renderPipeline(data);

        console.log("Leads API response:", data);

        const tbody = document.querySelector("#leadTable tbody");
        tbody.innerHTML = "";

        const filtered = data.filter(lead => {
            const priority = lead.priority || "";
            const name = (lead.name || "").toLowerCase();
            const phone = lead.phone || "";

            const matchesPriority = filter ? priority === filter : true;
            const matchesSearch =
                name.includes(search) ||
                phone.includes(search);

            return matchesPriority && matchesSearch;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align:center;padding:40px;">
                        <div style="font-size:18px;color:#777;">
                            📭 No leads found
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
    
        filtered.forEach(lead => {
            const priorityClass = (lead.priority || "COLD").toLowerCase();

            const row = `
            <tr class="${priorityClass}">
                <td>${lead.name || "-"}</td>
                <td>${lead.phone || "-"}</td>
                <td>${lead.car_interest || "-"}</td>
                <td>${lead.action_type || "-"}</td>
                <td>${lead.score || 0}</td>

                <td>
                    <span class="badge ${priorityClass}">
                        ${lead.priority || "COLD"}
                    </span>
                </td>

                <td>
                    <select onchange="updateStatus(${lead.id}, this.value)">
                        <option ${lead.status === "NEW" ? "selected" : ""}>NEW</option>
                        <option ${lead.status === "CONTACTED" ? "selected" : ""}>CONTACTED</option>
                        <option ${lead.status === "FOLLOW-UP" ? "selected" : ""}>FOLLOW-UP</option>
                        <option ${lead.status === "CLOSED" ? "selected" : ""}>CLOSED</option>
                    </select>
                </td>

                <!-- ASSIGN -->
                <td>
                    ${
                        user.role === "admin"
                        ? `
                        <select onchange="assignLead(${lead.id}, this.value)">
                            <option value="">Assign</option>
                            ${users.map(u => `
                                <option value="${u.id}" ${lead.assigned_to == u.id ? "selected" : ""}>
                                    ${u.name}
                                </option>
                            `).join("")}
                        </select>
                        `
                        : (lead.assigned_name || "Unassigned")
                    }
                </td>

                <!-- 🔴 NOTES FIELD -->
                <td>
                    <textarea 
                        placeholder="Add notes..."
                        onblur="saveNotes(${lead.id}, this.value)"
                    >${lead.notes || ""}</textarea>
                </td>

                <td class="actions">
                    <a href="tel:${lead.phone}">📞</a>
                    <a href="https://wa.me/91${lead.phone}" target="_blank">💬</a>
                </td>
            </tr>
            `;

            tbody.innerHTML += row;
        });

    } catch (error) {
        console.error("Load leads error:", error);
    }
}

// 🚀 UPDATE STATUS
async function updateStatus(id, status) {
    try {
        await fetch(`${API}/lead/${id}/status`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: token
            },
            body: JSON.stringify({ status })
        });

        loadLeads();
        loadAnalytics();

    } catch (error) {
        console.error("Status update error:", error);
    }
}

// 🚀 LOAD ANALYTICS + CHARTS
async function loadAnalytics() {
    try {
        const res = await fetch(`${API}/analytics`, {
            headers: {
                Authorization: token
            }
        });
        if (res.status === 401) {
            logout();
            return;
        }
        const data = await res.json();

        document.getElementById("total").innerText = data.total || 0;
        document.getElementById("hot").innerText = data.hot || 0;
        document.getElementById("warm").innerText = data.warm || 0;
        document.getElementById("cold").innerText = data.cold || 0;
        document.getElementById("enquiry").innerText = data.enquiry || 0;
        document.getElementById("testdrive").innerText = data.testdrive || 0;
        document.getElementById("closed").innerText = data.closed || 0;

        if (priorityChart) priorityChart.destroy();
        if (actionChart) actionChart.destroy();

        const ctx1 = document.getElementById("priorityChart");
        if (ctx1) {
            priorityChart = new Chart(ctx1.getContext("2d"), {
                type: "doughnut",
                data: {
                    labels: ["COLD", "HOT", "WARM"],
                    datasets: [{
                        data: [data.cold || 0, data.hot || 0, data.warm || 0]
                    }]
                }
            });
        }

        const ctx2 = document.getElementById("actionChart");
        if (ctx2) {
            actionChart = new Chart(ctx2.getContext("2d"), {
                type: "bar",
                data: {
                    labels: ["Enquiry", "Test Drive"],
                    datasets: [{
                        label: "User Actions",
                        data: [data.enquiry || 0, data.testdrive || 0]
                    }]
                }
            });
        }
        
    } catch (error) {
        console.error("Analytics error:", error);
    }
}

// 🔹 LOAD USERS
async function loadUsersTable() {
    try {
        const res = await fetch(`${API}/auth/users`, {
            headers: { Authorization: token }
        });

        if (res.status === 401) return logout();

        const data = await res.json();

        const tbody = document.querySelector("#userTable tbody");
        if (!tbody) return;

        tbody.innerHTML = "";

        data.forEach(u => {
            tbody.innerHTML += `
                <tr>
                    <td>${u.name}</td>
                    <td>${u.email}</td>
                    <td>${u.role}</td>
                    <td>
                        <button onclick="deleteUser(${u.id})" class="delete-user-btn">Delete</button>
                    </td>
                </tr>
            `;
        });

    } catch (err) {
        console.error("Users load error:", err);
    }
}

async function createUser() {
    const name = document.getElementById("uname").value.trim();
    const email = document.getElementById("uemail").value.trim();
    const password = document.getElementById("upassword").value.trim();
    const role = document.getElementById("urole").value;

    if (!name || !email || !password) {
        alert("All fields required");
        return;
    }

    await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: token
        },
        body: JSON.stringify({ name, email, password, role })
    });

    document.getElementById("uname").value = "";
    document.getElementById("uemail").value = "";
    document.getElementById("upassword").value = "";

    await loadUsers();
    loadUsersTable();
    loadLeads();
}

async function deleteUser(id) {
    if (!confirm("Delete this user?")) return;

    await fetch(`${API}/auth/user/${id}`, {
        method: "DELETE",
        headers: { Authorization: token }
    });

    await loadUsers();
    loadUsersTable();
    loadLeads();
}
function logout() {
    localStorage.removeItem("token");
    window.location.href = "login.html";
}
// 🚀 INITIAL LOAD
window.onload = async () => {
    if (!token) return logout();

    const userInfo = document.getElementById("userInfo");

    if (userInfo) {
        userInfo.innerText = `👤 ${user.name || "User"} (${user.role || "sales"})`;
    }

    await loadUsers();
    loadUsersTable();
    initDragDrop();
    loadLeads();
    loadAnalytics();
};
// 🔁 AUTO REFRESH (SAFE)
setInterval(() => {
    if (token) {
        loadLeads();
        loadAnalytics();
    }
}, 100000);