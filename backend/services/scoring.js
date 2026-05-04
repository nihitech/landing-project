function calculateScore(lead) {
    let score = 0;
    const tracking = lead.tracking || {};
    const action = String(lead.action_type || lead.lead_type || "").toUpperCase();
    const source = String(lead.source || "").toUpperCase();
    const purchaseTimeline = String(lead.purchase_timeline || "").toLowerCase();

    if (lead.name) score += 5;
    if (lead.phone) score += 10;
    if (lead.email) score += 5;
    if (lead.area || lead.district) score += 5;
    if (lead.profession) score += 5;
    if (lead.family_members) score += 5;
    if (lead.car_interest && lead.car_interest !== "Not Selected") score += 12;
    if (lead.variant_interest) score += 8;
    if (lead.budget_range) score += 8;
    if (lead.finance_required) score += 5;
    if (lead.exchange_vehicle) score += 5;

    if (action === "CALL" || action === "CALL_NOW") score += 25;
    if (action === "WHATSAPP") score += 20;
    if (action === "TEST_DRIVE") score += 35;
    if (action === "BOOKING") score += 40;
    if (action === "COMPLETE_ENQUIRY") score += 25;
    if (action === "QUICK_ENQUIRY" || action === "ENQUIRY") score += 15;

    if (source === "FACEBOOK" || source === "INSTAGRAM" || source === "GOOGLE_ADS") score += 10;
    if (source === "CALL_NOW" || source === "WHATSAPP") score += 15;

    if (lead.test_drive_date) score += 25;
    if (lead.showroom_visit_date) score += 25;
    if (lead.booking_expected_date) score += 30;

    if (purchaseTimeline.includes("today") || purchaseTimeline.includes("week") || purchaseTimeline.includes("7")) score += 20;
    if (purchaseTimeline.includes("month") || purchaseTimeline.includes("30")) score += 10;

    if (Number(tracking.time_spent || 0) > 60) score += 10;
    if (Number(tracking.scroll_depth || 0) > 50) score += 10;
    if ((tracking.clicks || []).length > 4) score += 5;
    if ((tracking.car_views || []).length > 0) score += 10;

    return Math.min(score, 100);
}

function getLeadPriority(score) {
    if (score >= 65) return "HOT";
    if (score >= 35) return "WARM";
    return "COLD";
}

module.exports = { calculateScore, getLeadPriority };
