const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const authenticateToken = require("../middleware/auth");

router.get("/summary", authenticateToken, async (req, res) => {
  try {
    const [
      totalLeads,
      todayFollowups,
      missedFollowups,
      hotLeads,
      bookings,
      deliveries,
      availableStock
    ] = await Promise.all([

      pool.query(`
        SELECT COUNT(*) AS count
        FROM leads
        WHERE status != 'DELETED'
      `),

      pool.query(`
        SELECT COUNT(*) AS count
        FROM followups
        WHERE DATE(next_followup_date) = CURRENT_DATE
      `),

      pool.query(`
        SELECT COUNT(*) AS count
        FROM followups
        WHERE next_followup_date < NOW()
          AND status != 'COMPLETED'
      `),

      pool.query(`
        SELECT COUNT(*) AS count
        FROM leads
        WHERE lead_temperature = 'HOT'
      `),

      pool.query(`
        SELECT COUNT(*) AS count
        FROM bookings
      `),

      pool.query(`
        SELECT COUNT(*) AS count
        FROM delivery_checklists
        WHERE delivery_status = 'DELIVERED'
      `),

      pool.query(`
        SELECT COUNT(*) AS count
        FROM vehicle_inventory_units
        WHERE vehicle_status = 'AVAILABLE'
      `)
    ]);

    res.json({
      success: true,

      summary: {
        total_leads: Number(totalLeads.rows[0].count || 0),
        today_followups: Number(todayFollowups.rows[0].count || 0),
        missed_followups: Number(missedFollowups.rows[0].count || 0),
        hot_leads: Number(hotLeads.rows[0].count || 0),
        bookings: Number(bookings.rows[0].count || 0),
        deliveries: Number(deliveries.rows[0].count || 0),
        available_stock: Number(availableStock.rows[0].count || 0)
      }
    });

  } catch (err) {
    console.error("DASHBOARD SUMMARY ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Failed to load dashboard"
    });
  }
});

module.exports = router;