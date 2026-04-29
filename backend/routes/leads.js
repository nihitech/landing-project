const express = require("express");
const router = express.Router();

const db = require("../config/db");
const sendWhatsApp = require("../services/whatsapp");
const { calculateScore, getLeadPriority } = require("../services/scoring");
const auth = require("../middleware/auth");

// 🔹 POST: Save Lead
router.post("/lead", async (req, res) => {
    try {
        const data = req.body;

        if (!data.name || !data.phone) {
            return res.status(400).json({ message: "Name & Phone required" });
        }

        const tracking = data.tracking || {};
        const score = calculateScore({ ...data, tracking });
        const priority = getLeadPriority(score);

        const now = new Date();
        const f1 = new Date(now.getTime() + 5 * 60 * 1000);
        const f2 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const f3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

        const result = await db.query(`
            INSERT INTO leads 
            (name, phone, email, area, district, profession, car_interest, action_type, tracking, score, priority, status, followup_1, followup_2, followup_3)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            RETURNING id
        `, [
            data.name,
            data.phone,
            data.email || "",
            data.area || "",
            data.district || "",
            data.profession || "",
            data.car_interest || "Not Selected",
            data.action_type || "ENQUIRY",
            tracking,
            score,
            priority,
            "NEW",
            f1, f2, f3
        ]);

        res.json({ message: "Lead saved", id: result.rows[0].id });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});


// 🔹 GET LEADS (ADMIN + SALES FILTER)
router.get("/leads", auth, async (req, res) => {
    try {
        let result;

        if (req.user.role === "admin") {
            result = await db.query(`
                SELECT l.*, u.name AS assigned_name
                FROM leads l
                LEFT JOIN users u ON l.assigned_to = u.id
                ORDER BY l.id DESC
            `);
        } else {
            result = await db.query(`
                SELECT l.*, u.name AS assigned_name
                FROM leads l
                LEFT JOIN users u ON l.assigned_to = u.id
                WHERE l.assigned_to = $1
                ORDER BY l.id DESC
            `, [req.user.id]);
        }

        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Fetch error" });
    }
});


// 🔹 UPDATE STATUS
router.put("/lead/:id/status", auth, async (req, res) => {
    await db.query(
        "UPDATE leads SET status=$1 WHERE id=$2",
        [req.body.status, req.params.id]
    );
    res.json({ message: "Updated" });
});


// 🔹 ASSIGN LEAD
router.put("/lead/:id/assign", auth, async (req, res) => {
    await db.query(
        "UPDATE leads SET assigned_to=$1 WHERE id=$2",
        [req.body.user_id, req.params.id]
    );
    res.json({ message: "Assigned" });
});


// 🔹 NOTES
router.put("/lead/:id/notes", auth, async (req, res) => {
    await db.query(
        "UPDATE leads SET notes=$1 WHERE id=$2",
        [req.body.notes, req.params.id]
    );
    res.json({ message: "Notes saved" });
});


// 🔹 ANALYTICS
router.get("/analytics", auth, async (req, res) => {
    const total = await db.query("SELECT COUNT(*) FROM leads");
    const closed = await db.query("SELECT COUNT(*) FROM leads WHERE status='CLOSED'");

    res.json({
        total: Number(total.rows[0].count),
        closed: Number(closed.rows[0].count)
    });
});

module.exports = router;