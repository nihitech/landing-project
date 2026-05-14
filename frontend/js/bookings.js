let bookingRows = [];

if (!token) {
    window.location.href = "login.html";
}

function value(id) {
    return document.getElementById(id)?.value || "";
}

function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
}

function checked(id) {
    return document.getElementById(id)?.checked === true;
}

function setChecked(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = val === true;
}

function dateOnly(value) {
    if (!value) return "-";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-IN");
}

function inputDate(value) {
    return value ? String(value).slice(0, 10) : "";
}

function money(value) {
    return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function statusBadge(status) {
    const cls = String(status || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");

    return `<span class="badge ${cls}">${safe(status || "-")}</span>`;
}

function buildBookingQuery() {
    const params = new URLSearchParams();

    const search = value("bookingSearch").trim();
    const bookingStatus = value("bookingStatusFilter");
    const retailStatus = value("retailStatusFilter");

    if (search) params.set("search", search);
    if (bookingStatus) params.set("booking_status", bookingStatus);
    if (retailStatus) params.set("retail_status", retailStatus);

    return params.toString();
}

async function loadBookings() {
    try {
        const query = buildBookingQuery();

        bookingRows = await request(`${API}/bookings${query ? `?${query}` : ""}`, {
            headers: authHeaders()
        });

        renderBookings();

    } catch (err) {
        toast(err.message || "Failed to load bookings", true);
    }
}

function renderBookings() {
    const tbody = document.getElementById("bookingTable");
    if (!tbody) return;

    if (!bookingRows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">No bookings found</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = bookingRows.map(row => `
        <tr>
            <td>
                <strong>${safe(row.booking_no || "-")}</strong>
                <small>${dateOnly(row.booking_date)}</small>
                <small>Receipt: ${safe(row.receipt_no || "-")}</small>
            </td>

            <td>
                <strong>${safe(row.customer_name || "-")}</strong>
                <small>${safe(row.customer_phone || "-")}</small>
                <small>Lead: ${safe(row.lead_id || "-")}</small>
            </td>

            <td>
                <strong>${safe(row.model_name || "-")}</strong>
                <small>${safe(row.variant_name || "-")}</small>
                <small>Color: ${safe(row.color_name || "-")}</small>
                <small>VIN: ${safe(row.vin_number || "-")}</small>
            </td>

            <td><strong>${money(row.booking_amount)}</strong></td>

            <td>
                ${row.finance_required ? "Required" : "No"}
                <small>${safe(row.finance_partner || "-")}</small>
                <small>${safe(row.loan_status || "-")}</small>
            </td>

            <td>
                ${row.insurance_required ? "Required" : "No"}
                <small>${safe(row.insurance_partner || "-")}</small>
                <small>${safe(row.insurance_status || "-")}</small>
            </td>

            <td>
                ${row.exchange_required ? "Required" : "No"}
                <small>${safe(row.exchange_status || "-")}</small>
            </td>

            <td>
                ${statusBadge(row.retail_status)}
                <small>${safe(row.retail_invoice_no || "-")}</small>
                <small>${dateOnly(row.retail_date)}</small>
            </td>

            <td>${statusBadge(row.booking_status)}</td>

            <td class="compact-actions">
                <button onclick='editBooking(${JSON.stringify(row)})' class="icon-btn view-btn" title="Edit Booking">✏️</button>
            </td>
        </tr>
    `).join("");
}

function openBookingModal({ leadId = "", inventoryId = "", leadName = "", vehicleText = "" } = {}) {
    resetBookingForm();

    setValue("bookingLeadId", leadId);
    setValue("bookingInventoryId", inventoryId);

    document.getElementById("bookingInfoBox").innerHTML = `
        <div class="stock-mini-card">
            <strong>${safe(leadName || "New Booking")}</strong>
            <small>${safe(vehicleText || "Booking workflow")}</small>
        </div>
    `;

    document.getElementById("bookingModal").classList.add("show");
}

function closeBookingModal() {
    document.getElementById("bookingModal").classList.remove("show");
}

function editBooking(row) {
    setValue("bookingId", row.id || "");
    setValue("bookingLeadId", row.lead_id || "");
    setValue("bookingInventoryId", row.inventory_id || "");

    document.getElementById("bookingInfoBox").innerHTML = `
        <div class="stock-mini-card">
            <strong>${safe(row.customer_name || "-")} | ${safe(row.booking_no || "-")}</strong>
            <small>${safe(row.model_name || "-")} ${safe(row.variant_name || "-")} | VIN: ${safe(row.vin_number || "-")}</small>
        </div>
    `;

    setValue("bookingNo", row.booking_no || "");
    setValue("bookingDate", inputDate(row.booking_date));
    setValue("bookingAmount", row.booking_amount || 0);
    setValue("receiptNo", row.receipt_no || "");
    setValue("bookingStatus", row.booking_status || "BOOKED");

    setChecked("financeRequired", row.finance_required === true);
    setValue("financePartner", row.finance_partner || "");
    setValue("loanStatus", row.loan_status || "NOT_REQUIRED");

    setChecked("insuranceRequired", row.insurance_required !== false);
    setValue("insurancePartner", row.insurance_partner || "");
    setValue("insuranceStatus", row.insurance_status || "PENDING");

    setChecked("exchangeRequired", row.exchange_required === true);
    setValue("exchangeVehicleDetails", row.exchange_vehicle_details || "");
    setValue("exchangeStatus", row.exchange_status || "NOT_REQUIRED");

    setValue("retailStatus", row.retail_status || "PENDING");
    setValue("retailInvoiceNo", row.retail_invoice_no || "");
    setValue("retailDate", inputDate(row.retail_date));
    setValue("bookingRemarks", row.remarks || "");

    document.getElementById("bookingModalTitle").innerText = "Edit Booking";
    document.getElementById("bookingModal").classList.add("show");
}

function getBookingPayload() {
    return {
        lead_id: value("bookingLeadId"),
        inventory_id: value("bookingInventoryId") || null,

        booking_no: value("bookingNo").trim(),
        booking_date: value("bookingDate") || null,
        booking_amount: value("bookingAmount") || 0,
        receipt_no: value("receiptNo").trim(),
        booking_status: value("bookingStatus"),

        finance_required: checked("financeRequired"),
        finance_partner: value("financePartner").trim(),
        loan_status: value("loanStatus"),

        insurance_required: checked("insuranceRequired"),
        insurance_partner: value("insurancePartner").trim(),
        insurance_status: value("insuranceStatus"),

        exchange_required: checked("exchangeRequired"),
        exchange_vehicle_details: value("exchangeVehicleDetails").trim(),
        exchange_status: value("exchangeStatus"),

        retail_status: value("retailStatus"),
        retail_invoice_no: value("retailInvoiceNo").trim(),
        retail_date: value("retailDate") || null,

        remarks: value("bookingRemarks").trim()
    };
}

async function saveBooking() {
    const bookingId = value("bookingId");
    const payload = getBookingPayload();

    if (!payload.lead_id) {
        toast("Lead ID is required for booking", true);
        return;
    }

    const url = bookingId
        ? `${API}/bookings/${bookingId}`
        : `${API}/bookings`;

    const method = bookingId ? "PUT" : "POST";

    try {
        await request(url, {
            method,
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });

        toast(bookingId ? "Booking updated" : "Booking created");

        closeBookingModal();
        await loadBookings();

    } catch (err) {
        toast(err.message || "Booking save failed", true);
    }
}

function resetBookingForm() {
    [
        "bookingId",
        "bookingLeadId",
        "bookingInventoryId",
        "bookingNo",
        "bookingDate",
        "bookingAmount",
        "receiptNo",
        "financePartner",
        "insurancePartner",
        "exchangeVehicleDetails",
        "retailInvoiceNo",
        "retailDate",
        "bookingRemarks"
    ].forEach(id => setValue(id, ""));

    setValue("bookingAmount", 0);
    setValue("bookingStatus", "BOOKED");
    setValue("loanStatus", "NOT_REQUIRED");
    setValue("insuranceStatus", "PENDING");
    setValue("exchangeStatus", "NOT_REQUIRED");
    setValue("retailStatus", "PENDING");

    setChecked("financeRequired", false);
    setChecked("insuranceRequired", true);
    setChecked("exchangeRequired", false);

    document.getElementById("bookingModalTitle").innerText = "Booking Details";
}

window.loadBookings = loadBookings;
window.openBookingModal = openBookingModal;
window.closeBookingModal = closeBookingModal;
window.editBooking = editBooking;
window.saveBooking = saveBooking;

window.onload = async () => {
    await loadBookings();

        const leadId = sessionStorage.getItem("booking_lead_id");

        if (leadId) {
            const leadName = sessionStorage.getItem("booking_lead_name") || "";
            const inventoryId = sessionStorage.getItem("booking_inventory_id") || "";
            const vehicleText = sessionStorage.getItem("booking_vehicle_text") || "";

            sessionStorage.removeItem("booking_lead_id");
            sessionStorage.removeItem("booking_lead_name");
            sessionStorage.removeItem("booking_inventory_id");
            sessionStorage.removeItem("booking_vehicle_text");

            openBookingModal({
                leadId,
                inventoryId,
                leadName,
                vehicleText
            });
        }

};