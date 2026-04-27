// 🔹 TRACKING STATE
let trackingData = {
    session_start: Date.now(),
    time_spent: 0,
    clicks: [],
    scroll_depth: 0,
    car_views: [],
    engagement_score: 0
};

// 🔹 TIME SPENT TRACKING
setInterval(() => {
    trackingData.time_spent = Math.floor((Date.now() - trackingData.session_start) / 1000);
}, 1000);

// 🔹 CLICK TRACKING
document.addEventListener("click", function (e) {
    const label = e.target.innerText || e.target.tagName;

    trackingData.clicks.push({
        label: label,
        time: Date.now()
    });

    updateEngagement(1);
});

// 🔹 SCROLL TRACKING
window.addEventListener("scroll", () => {
    const scrollTop = window.scrollY;
    const docHeight = document.body.scrollHeight - window.innerHeight;

    const scrollPercent = Math.round((scrollTop / docHeight) * 100);

    if (scrollPercent > trackingData.scroll_depth) {
        trackingData.scroll_depth = scrollPercent;
        updateEngagement(2);
    }
});

// 🔹 CAR VIEW TRACKING
function trackCarView(carName) {
    trackingData.car_views.push({
        car: carName,
        time: Date.now()
    });

    updateEngagement(5);
}

// 🔹 ENGAGEMENT SCORE SYSTEM
function updateEngagement(points) {
    trackingData.engagement_score += points;
}

// 🔹 DEBUG VIEW (for now)
function printTracking() {
    console.log("Tracking Data:", trackingData);
}