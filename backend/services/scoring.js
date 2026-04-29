function calculateScore(lead) {
    let score = 0;
    const tracking = lead.tracking || {};
    const action = String(lead.action_type || "").toUpperCase();

    if (lead.name) score += 5;
    if (lead.phone) score += 10;
    if (lead.email) score += 5;
    if (lead.area || lead.district) score += 5;
    if (lead.car_interest && lead.car_interest !== "Not Selected") score += 10;

    if (action === "TEST_DRIVE") score += 35;
    if (action === "ENQUIRY") score += 15;

    if (Number(tracking.time_spent || 0) > 60) score += 10;
    if (Number(tracking.scroll_depth || 0) > 50) score += 10;
    if ((tracking.clicks || []).length > 4) score += 5;
    if ((tracking.car_views || []).length > 0) score += 10;

    return Math.min(score, 100);
}

function getLeadPriority(score) {
    if (score >= 60) return "HOT";
    if (score >= 35) return "WARM";
    return "COLD";
}

module.exports = { calculateScore, getLeadPriority };
