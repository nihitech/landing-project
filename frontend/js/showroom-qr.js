let sessions = [];
let submissions = [];
let selectedQrUrl = "";
let selectedQrSession = null;

if (!token) {
    window.location.href = "login.html";
}

function val(id) {
    return document.getElementById(id)?.value || "";
}

function setAssistVal(id, value = "") {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

async function createQrSession() {
    try {
        const result = await request(`${API}/showroom-qr/sessions`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify({})
        });

        toast(result.message || "QR session ready");
        await loadQrData();

        if (result.session) {
            selectQr(result.session.session_code, result.session.session_name || result.session.session_code);
        }

    } catch (err) {
        toast(err.message || "QR session creation failed", true);
    }
}

async function loadQrData() {
    try {
        const [sessionData, submissionData] = await Promise.all([
            request(`${API}/showroom-qr/sessions`, { headers: authHeaders() }),
            request(`${API}/showroom-qr/submissions`, { headers: authHeaders() })
        ]);

        sessions = sessionData || [];
        submissions = submissionData || [];

        renderSessions();
        renderSubmissions();

        if (!selectedQrUrl && sessions.length) {
            selectQr(sessions[0].session_code, sessions[0].session_name || sessions[0].session_code);
        }

    } catch (err) {
        toast(err.message || "Failed to load showroom QR data", true);
    }
}

function qrUrl(code) {
    return `${window.location.origin}/showroom-qr.html?code=${encodeURIComponent(code)}`;
}

function renderSessions() {
    const box = document.getElementById("sessionCards");
    if (!box) return;

    if (!sessions.length) {
        box.innerHTML = `<div class="empty-state">No QR sessions found. Create today's QR.</div>`;
        return;
    }

    box.innerHTML = sessions.map(s => {
        const url = qrUrl(s.session_code);

        return `
            <div class="qr-session-card ${s.qr_status === "ACTIVE" ? "active" : ""}">
                <div>
                    <strong>${safe(s.session_name || s.session_code)}</strong>
                    <small>${safe(s.branch_name || "-")} ${s.branch_code ? `(${safe(s.branch_code)})` : ""}</small>
                    <small>${safe(s.session_code)} • ${Number(s.submissions_count || 0)} submissions</small>
                </div>
                <div class="qr-session-actions">
                    <button onclick="selectQr('${safe(s.session_code)}','${safe(s.session_name || s.session_code)}')" class="copy-btn">Show QR</button>
                    <button onclick="openAssistModal(${s.id})" class="save-btn">Assisted Entry</button>
                    <a href="${url}" target="_blank" class="icon-link">Open</a>
                </div>
            </div>
        `;
    }).join("");
}

async function selectQr(code, title) {
    selectedQrUrl = qrUrl(code);
    selectedQrSession = code;

    document.getElementById("qrPreviewTitle").innerText = title || code;
    document.getElementById("qrPlaceholder").style.display = "none";

    const canvas = document.getElementById("qrCanvas");
    canvas.style.display = "block";

    if (window.QRCode) {
        await QRCode.toCanvas(canvas, selectedQrUrl, {
            width: 260,
            margin: 2,
            errorCorrectionLevel: "M"
        });
    } else {
        toast("QR library not loaded. Use Copy/Open link.", true);
    }
}

function renderSubmissions() {
    const tbody = document.getElementById("submissionTable");
    if (!tbody) return;

    if (!submissions.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No QR submissions found</td></tr>`;
        return;
    }

    tbody.innerHTML = submissions.map(row => `
        <tr>
            <td>
                <strong>${safe(row.customer_name)}</strong>
                <small>${safe(row.phone)}</small>
                <small>${safe(row.area || "")} ${safe(row.district || "")}</small>
            </td>
            <td>
                ${safe(row.vehicle_category || "-")} / ${safe(row.fuel_type || "-")}
                <small>${safe(row.car_interest || "-")}</small>
                <small>${safe(row.variant_interest || "-")}</small>
            </td>
            <td>${safe(row.submission_method || "-")}</td>
            <td>${row.consent_accepted ? "✅ Yes" : "❌ No"}</td>
            <td><span class="badge ${String(row.submission_status || "").toLowerCase()}">${safe(row.submission_status)}</span></td>
            <td>${safe(row.assigned_user_name || "Auto / Unassigned")}</td>
            <td>
                ${
                    row.lead_id
                        ? `<a href="leads.html?lead=${row.lead_id}" class="icon-link">Lead #${row.lead_id}</a>`
                        : `<button onclick="convertSubmission(${row.id})" class="save-btn">Convert</button>`
                }
            </td>
        </tr>
    `).join("");
}

async function convertSubmission(id) {
    if (!confirm("Convert this showroom QR submission to lead?")) return;

    try {
        const result = await request(`${API}/showroom-qr/submissions/${id}/convert`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify({})
        });

        toast(result.message || "Converted to lead");
        await loadQrData();

    } catch (err) {
        toast(err.message || "Conversion failed", true);
    }
}

function copySelectedQr() {
    if (!selectedQrUrl) return toast("Select QR first", true);
    navigator.clipboard.writeText(selectedQrUrl)
        .then(() => toast("QR link copied"))
        .catch(() => toast("Copy failed", true));
}

function openSelectedQr() {
    if (!selectedQrUrl) return toast("Select QR first", true);
    window.open(selectedQrUrl, "_blank");
}

function downloadSelectedQr() {
    const canvas = document.getElementById("qrCanvas");
    if (!selectedQrUrl || !canvas) return toast("Select QR first", true);

    const link = document.createElement("a");
    link.download = `showroom-qr-${selectedQrSession || "session"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

function printSelectedQr() {
    const canvas = document.getElementById("qrCanvas");
    if (!selectedQrUrl || !canvas) return toast("Select QR first", true);

    const img = canvas.toDataURL("image/png");
    const win = window.open("", "_blank");

    win.document.write(`
        <html>
        <head>
            <title>Showroom QR</title>
            <style>
                body{font-family:Arial,sans-serif;text-align:center;padding:40px;}
                .card{border:2px solid #111827;border-radius:20px;padding:30px;display:inline-block;}
                img{width:320px;height:320px;}
                h1{margin:0 0 10px;}
                p{color:#475569;}
            </style>
        </head>
        <body>
            <div class="card">
                <h1>NIKRION Showroom Enquiry</h1>
                <p>Scan QR and submit your enquiry</p>
                <img src="${img}">
                <p>${selectedQrUrl}</p>
            </div>
        </body>
        </html>
    `);

    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
}

function openAssistModal(sessionId) {
    document.getElementById("assistSessionId").value = sessionId;
    [
        "assistName", "assistPhone", "assistAltPhone", "assistEmail", "assistArea",
        "assistDistrict", "assistPincode", "assistFuelType", "assistCarInterest",
        "assistVariant", "assistColor", "assistNotes"
    ].forEach(id => setAssistVal(id, ""));

    document.getElementById("assistVehicleCategory").value = "AD";
    document.getElementById("assistReason").value = "NO_SMARTPHONE";
    document.getElementById("assistConsent").checked = false;
    document.getElementById("assistModal").classList.add("show");
}

function closeAssistModal() {
    document.getElementById("assistModal").classList.remove("show");
}

async function submitAssistedEntry() {
    const sessionId = val("assistSessionId");

    const payload = {
        customer_name: val("assistName").trim(),
        phone: val("assistPhone").trim(),
        alternate_phone: val("assistAltPhone").trim(),
        email: val("assistEmail").trim(),
        area: val("assistArea").trim(),
        district: val("assistDistrict").trim(),
        pincode: val("assistPincode").trim(),
        vehicle_category: val("assistVehicleCategory"),
        fuel_type: val("assistFuelType").trim(),
        car_interest: val("assistCarInterest").trim(),
        variant_interest: val("assistVariant").trim(),
        preferred_color: val("assistColor").trim(),
        notes: val("assistNotes").trim(),
        assisted_reason: val("assistReason"),
        consent_accepted: document.getElementById("assistConsent").checked
    };

    if (!payload.customer_name || !payload.phone) {
        return toast("Customer name and phone are required", true);
    }

    if (!payload.consent_accepted) {
        return toast("Consent confirmation is required", true);
    }

    try {
        await request(`${API}/showroom-qr/assisted-submit/${sessionId}`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast("Assisted showroom enquiry submitted");
        closeAssistModal();
        await loadQrData();

    } catch (err) {
        toast(err.message || "Assisted entry failed", true);
    }
}

window.createQrSession = createQrSession;
window.convertSubmission = convertSubmission;
window.copySelectedQr = copySelectedQr;
window.openSelectedQr = openSelectedQr;
window.downloadSelectedQr = downloadSelectedQr;
window.printSelectedQr = printSelectedQr;
window.selectQr = selectQr;
window.openAssistModal = openAssistModal;
window.closeAssistModal = closeAssistModal;
window.submitAssistedEntry = submitAssistedEntry;

window.onload = loadQrData;
