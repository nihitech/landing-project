require("dotenv").config();

const express = require("express");
const cors = require("cors");

const leadRoutes = require("./routes/leads");
const authRoutes = require("./routes/auth");
const reportRoutes = require("./routes/reports");

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
app.use("/api", leadRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);

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

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
