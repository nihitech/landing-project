let priorityChart, actionChart;
async function loadLeads() {
    const filter = document.getElementById("filter").value;

    const res = await fetch("http://localhost:5000/api/leads");
    const data = await res.json();

    const tbody = document.querySelector("#leadTable tbody");
    tbody.innerHTML = "";

    const filtered = filter
        ? data.filter(l => l.priority === filter)
        : data;

    filtered.forEach(lead => {

        let priorityClass = "";
        if (lead.priority === "HOT") priorityClass = "hot";
        else if (lead.priority === "WARM") priorityClass = "warm";
        else priorityClass = "cold";

        const row = `
            <tr>
                <td>${lead.name}</td>
                <td>${lead.phone}</td>
                <td>${lead.car_interest}</td>
                <td>${lead.action_type}</td>
                <td>${lead.score}</td>
                <td class="${priorityClass}">${lead.priority}</td>

                <!-- 🔴 NEW STATUS COLUMN -->
                <td>
                    <select onchange="updateStatus(${lead.id}, this.value)">
                        <option ${lead.status === 'NEW' ? 'selected' : ''}>NEW</option>
                        <option ${lead.status === 'CONTACTED' ? 'selected' : ''}>CONTACTED</option>
                        <option ${lead.status === 'FOLLOW-UP' ? 'selected' : ''}>FOLLOW-UP</option>
                        <option ${lead.status === 'CLOSED' ? 'selected' : ''}>CLOSED</option>
                    </select>
                </td>

                <td>
                    <a href="tel:${lead.phone}">📞</a>
                    <a href="https://wa.me/91${lead.phone}" target="_blank">💬</a>
                </td>
            </tr>
        `;

        tbody.innerHTML += row;
    });
}


// 🔴 NEW FUNCTION (MUST ADD BELOW)
async function updateStatus(id, status) {
    try {
        await fetch(`http://localhost:5000/api/lead/${id}/status`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status })
        });

        console.log("Status updated:", id, status);

    } catch (error) {
        console.error("Status update error:", error);
    }
}
async function loadAnalytics() {
    try {
        const res = await fetch("http://localhost:5000/api/analytics");
        const data = await res.json();

        // ✅ Update numbers
        document.getElementById("total").innerText = data.total;
        document.getElementById("hot").innerText = data.hot;
        document.getElementById("warm").innerText = data.warm;
        document.getElementById("cold").innerText = data.cold;
        document.getElementById("enquiry").innerText = data.enquiry;
        document.getElementById("testdrive").innerText = data.testdrive;
        document.getElementById("closed").innerText = data.closed;

        // 🔥 Destroy old charts before re-render
        if (priorityChart) priorityChart.destroy();
        if (actionChart) actionChart.destroy();

        // 🔴 Priority Chart
        const ctx1 = document.getElementById("priorityChart").getContext("2d");
        priorityChart = new Chart(ctx1, {
            type: "doughnut",
            data: {
                labels: ["HOT", "WARM", "COLD"],
                datasets: [{
                    data: [data.hot, data.warm, data.cold]
                }]
            }
        });

        // 🔵 Action Chart
        const ctx2 = document.getElementById("actionChart").getContext("2d");
        actionChart = new Chart(ctx2, {
            type: "bar",
            data: {
                labels: ["Enquiry", "Test Drive"],
                datasets: [{
                    label: "User Actions",
                    data: [data.enquiry, data.testdrive]
                }]
            }
        });

    } catch (error) {
        console.error("Analytics error:", error);
    }
}
window.onload = () => {
    loadLeads();
    loadAnalytics();
};