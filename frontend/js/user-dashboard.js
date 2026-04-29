const API = "https://landing-backend-8gvq.onrender.com/api";

const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "{}");

if (!token) {
    window.location.href = "login.html";
}

async function loadLeads() {
    try {
        const filter = document.getElementById("filter")?.value || "";
        const search = document.getElementById("searchInput")?.value.toLowerCase() || "";

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

        const tbody = document.querySelector("#leadTable tbody");
        tbody.innerHTML = "";

        const filtered = data.filter(lead => {
            const priority = lead.priority || "";
            const name = (lead.name || "").toLowerCase();
            const phone = lead.phone || "";

            const matchesPriority = filter ? priority === filter : true;
            const matchesSearch = name.includes(search) || phone.includes(search);

            return matchesPriority && matchesSearch;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center;padding:35px;">
                        📭 No assigned leads found
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

function renderPipeline(leads) {
    const zones = {
        new: document.getElementById("new"),
        contacted: document.getElementById("contacted"),
        followup: document.getElementById("followup"),
        closed: document.getElementById("closedZone")
    };

    Object.values(zones).forEach(zone => {
        if (zone) zone.innerHTML = "";
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
        const normalizedStatus = (lead.status || "NEW").trim().toUpperCase();
        const statusKey = statusMap[normalizedStatus] || "new";

        counters[statusKey]++;

        const card = document.createElement("div");
        card.className = `lead-card ${(lead.priority || "COLD").toLowerCase()}`;
        card.draggable = true;

        card.innerHTML = `
            <strong>${lead.name || "-"}</strong>
            <div class="lead-meta">${lead.phone || "-"}</div>
            <div class="lead-meta">${lead.car_interest || "Not Selected"}</div>
            <div class="lead-meta">${lead.notes ? "📝 " + lead.notes.slice(0, 40) : "No notes"}</div>
        `;

        card.dataset.id = lead.id;

        card.addEventListener("dragstart", e => {
            e.dataTransfer.setData("id", lead.id);
        });

        if (zones[statusKey]) {
            zones[statusKey].appendChild(card);
        }
    });

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
            loadAnalytics();
        });
    });
}

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

        loadAnalytics();

    } catch (error) {
        console.error("Status update error:", error);
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

    } catch (error) {
        console.error("Analytics error:", error);
    }
}

function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "login.html";
}

window.onload = () => {
    if (!token) return logout();

    const userInfo = document.getElementById("userInfo");

    if (userInfo) {
        userInfo.innerText = `👤 ${user.name || "Sales User"} (${user.role || "sales"})`;
    }

    initDragDrop();
    loadLeads();
    loadAnalytics();
};

setInterval(() => {
    if (token) {
        loadLeads();
        loadAnalytics();
    }
}, 10000);