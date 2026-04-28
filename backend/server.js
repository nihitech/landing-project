require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

// 🔹 Middlewares
app.use(express.json());

app.use(cors({
    origin: "*"
}));

// 🔹 Routes
const leadRoutes = require("./routes/leads");
const authRoutes = require("./routes/auth");

app.use("/api", leadRoutes);
app.use("/api/auth", authRoutes);

// 🔹 Test route
app.get("/", (req, res) => {
    res.send("API Running");
});

// 🔹 Background jobs (follow-up cron)
require("./services/followupCron");

// 🔹 Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});