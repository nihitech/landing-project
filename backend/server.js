require("dotenv").config();

const express = require("express");
const cors = require("cors");

const leadRoutes = require("./routes/leads");
const authRoutes = require("./routes/auth");
const reportRoutes = require("./routes/reports");
const branchRoutes = require("./routes/branches");
const departmentRoutes = require("./routes/departments");
const permissionRoutes = require("./routes/permissions");
const vehicleRoutes = require("./routes/vehicles");
const stockRoutes = require("./routes/stock");
const inventoryRoutes = require("./routes/inventory");
const deliveryRoutes = require("./routes/delivery");
const bookingRoutes = require("./routes/bookings");
const dashboardRoutes = require("./routes/dashboard");
const activityRoutes = require("./routes/activity");
const fieldActivityRoutes = require("./routes/fieldActivities");
const showroomQrRoutes = require("./routes/showroomQr");
const quickEnquiryRoutes = require("./routes/quickEnquiries");
const vehicleIntelligenceRoutes = require("./routes/vehicleIntelligence");
const governanceRoutes = require("./routes/governance");
const dataChangeRequestRoutes = require("./routes/dataChangeRequests");
const communicationRoutes = require("./routes/communications");
const notificationRoutes = require("./routes/notifications");
const customerTimelineRoutes = require("./routes/customerTimeline");
const processActionRoutes = require("./routes/processActions");
const callLogRoutes = require("./routes/callLogs");
const performanceScorecardRoutes = require("./routes/performanceScorecard");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "*")
    .split(",")
    .map(origin => origin.trim());

app.use(express.json({ limit: "2mb" }));

app.use(cors({
    origin(origin, callback) {
        if (
            !origin ||
            allowedOrigins.includes("*") ||
            allowedOrigins.includes(origin)
        ) {
            return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"));
    }
}));

// Routes

// Render deployment live version check
app.get("/api/version-check", (req, res) => {
    res.json({
        version: "governance-live-check-v1",
        service: "NIKRION DealerOS Backend",
        governance_route_expected: "/api/governance/me",
        deployed_at: new Date().toISOString()
    });
});


app.get("/api/db-health-check", async (req, res) => {
    try {
        const db = require("./config/db");
        const branches = await db.query("SELECT COUNT(*)::int AS count FROM branches");
        const leads = await db.query("SELECT COUNT(*)::int AS count FROM leads");
        res.json({
            ok: true,
            branches: branches.rows[0].count,
            leads: leads.rows[0].count,
            time: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({
            ok: false,
            message: err.message,
            code: err.code,
            detail: err.detail
        });
    }
});

app.use("/api", leadRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/field-activities", fieldActivityRoutes);
app.use("/api/showroom-qr", showroomQrRoutes);
app.use("/api/quick-enquiries", quickEnquiryRoutes);
app.use("/api/vehicle-intelligence", vehicleIntelligenceRoutes);
app.use("/api/governance", governanceRoutes);
app.use("/api/data-change-requests", dataChangeRequestRoutes);
app.use("/api/communications", communicationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/customer-timeline", customerTimelineRoutes);
app.use("/api/process-actions", processActionRoutes);
app.use("/api/call-logs", callLogRoutes);
app.use("/api/performance-scorecard", performanceScorecardRoutes);
// Test routes
app.get("/", (req, res) => {
    res.json({ message: "Mahindra Lead CRM API running" });
});

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        time: new Date().toISOString()
    });
});

// Background jobs
require("./services/followupCron");
require("./services/reminderCron");
if (process.env.ENABLE_REPORT_CRON === "true") {
    require("./services/reportCron");
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});