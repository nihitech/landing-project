require("dotenv").config();

const express = require("express");
const cron = require("node-cron");
const cors = require("cors");

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || "*").split(",").map(o => o.trim());

app.use(express.json({ limit: "1mb" }));
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
    }
}));

app.use("/api", require("./routes/leads"));
app.use("/api/auth", require("./routes/auth"));

app.get("/", (req, res) => res.json({ message: "Mahindra Lead CRM API running" }));
app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

require("./services/followupCron");

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
cron.schedule("*/5 * * * *", async () => {
  console.log("⏱ Checking follow-ups...");

  try {
    await db.query(`
      UPDATE leads
      SET status = 'FOLLOW-UP'
      WHERE 
        status IN ('NEW','CONTACTED')
        AND followup_1 <= NOW()
    `);

    await db.query(`
      UPDATE leads
      SET status = 'FOLLOW-UP'
      WHERE 
        status = 'FOLLOW-UP'
        AND followup_2 <= NOW()
    `);

    await db.query(`
      UPDATE leads
      SET status = 'LOST'
      WHERE 
        status != 'CLOSED'
        AND followup_3 <= NOW()
    `);

  } catch (err) {
    console.error("FOLLOWUP CRON ERROR:", err);
  }
});
