const calculateScore = (lead) => {
    let score = 0;

    const tracking = lead.tracking || {};

    // Time spent
    if (tracking.time_spent > 60) score += 10;

    // Scroll depth
    if (tracking.scroll_depth > 50) score += 10;

    // Clicks
    if (tracking.clicks && tracking.clicks.length > 5) score += 5;

    // Car views
    if (tracking.car_views && tracking.car_views.length > 0) score += 15;

    // Action type
    if (lead.action_type === "test_drive") score += 25;
    if (lead.action_type === "enquiry") score += 10;

    return score;
};

// 🔹 Lead Category
const getLeadPriority = (score) => {
    if (score >= 40) return "HOT";
    if (score >= 20) return "WARM";
    return "COLD";
};

module.exports = { calculateScore, getLeadPriority };