const express = require("express");
const router = express.Router();

const db = require("../config/db");
const sendWhatsApp = require("../services/whatsapp");
const { calculateScore, getLeadPriority } = require("../services/scoring");
const auth = require("../middleware/auth"); // 🔐 NEW

// 🔹 POST: Save Lead (PUBLIC - no auth)
router.post("/lead", async (req, res) => {
    try {
        const data = req.body;

        console.log("Incoming Lead:", data);

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

        const sql = `
            INSERT INTO leads 
            (name, phone, email, area, district, profession, car_interest, action_type, tracking, score, priority, status, followup_1, followup_2, followup_3)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            RETURNING id
        `;

        const values = [
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
            f1,
            f2,
            f3
        ];

        const result = await db.query(sql, values);
        const leadId = result.rows[0].id;

        console.log("✅ Lead saved:", leadId);

        // 🔹 WhatsApp (non-blocking)
        sendWhatsApp(
            `whatsapp:+91${data.phone}`,
            `Hi ${data.name},

Thanks for your interest in ${data.car_interest || "Mahindra"}.

Our team will contact you shortly.

- Shiva Automobiles`
        ).catch(err => console.error("WA Customer Error:", err.message));

        sendWhatsApp(
            process.env.SALES_WHATSAPP_NUMBER,
            `New Lead 🚗

Name: ${data.name}
Phone: ${data.phone}
Car: ${data.car_interest || "Not Selected"}
Action: ${data.action_type || "ENQUIRY"}

🔥 Score: ${score}
Priority: ${priority}`
        ).catch(err => console.error("WA Sales Error:", err.message));

        res.json({
            message: "Lead saved successfully",
            id: leadId,
            score,
            priority
        });

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ message: "Server error" });
    }
});


// 🔐 GET: All Leads (PROTECTED)
router.get("/leads", auth, async (req, res) => {
    try {
        let result;

        // 👑 ADMIN → see all leads
        if (req.user.role === "admin") {
            result = await db.query(`
                SELECT l.*, u.name AS assigned_name
                FROM leads l
                LEFT JOIN users u ON l.assigned_to = u.id
                ORDER BY l.id DESC
            `);
        }

        // 👨‍💼 SALES → only assigned leads
        else {
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
        console.error("Fetch Error:", err);
        res.status(500).json({ message: "Error fetching leads" });
    }
});

// 🔐 UPDATE STATUS
router.put("/lead/:id/status", auth, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatus = ["NEW", "CONTACTED", "FOLLOW-UP", "CLOSED"];

    if (!allowedStatus.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }

    try {
        await db.query(
            "UPDATE leads SET status = $1 WHERE id = $2",
            [status, id]
        );

        res.json({ message: "Status updated successfully" });

    } catch (err) {
        console.error("Status Update Error:", err);
        res.status(500).json({ message: "Update failed" });
    }
});


// 🔐 ASSIGN LEAD TO USER
router.put("/lead/:id/assign", auth, async (req, res) => {
    const { id } = req.params;
    const { user_id } = req.body;

    try {
        await db.query(
            "UPDATE leads SET assigned_to = $1 WHERE id = $2",
            [user_id, id]
        );

        res.json({ message: "Lead assigned successfully" });

    } catch (err) {
        console.error("Assign Error:", err);
        res.status(500).json({ message: "Assign failed" });
    }
});


// 🔐 ADD / UPDATE NOTES
router.put("/lead/:id/notes", auth, async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;

    try {
        await db.query(
            "UPDATE leads SET notes = $1 WHERE id = $2",
            [notes, id]
        );

        res.json({ message: "Notes updated successfully" });

    } catch (err) {
        console.error("Notes Error:", err);
        res.status(500).json({ message: "Notes update failed" });
    }
});


// 🔐 ANALYTICS
router.get("/analytics", auth, async (req, res) => {
    try {
        const total = await db.query("SELECT COUNT(*) FROM leads");
        const hot = await db.query("SELECT COUNT(*) FROM leads WHERE priority='HOT'");
        const warm = await db.query("SELECT COUNT(*) FROM leads WHERE priority='WARM'");
        const cold = await db.query("SELECT COUNT(*) FROM leads WHERE priority='COLD'");
        const enquiry = await db.query("SELECT COUNT(*) FROM leads WHERE action_type='ENQUIRY'");
        const testdrive = await db.query("SELECT COUNT(*) FROM leads WHERE action_type='TEST_DRIVE'");
        const closed = await db.query("SELECT COUNT(*) FROM leads WHERE status='CLOSED'");

        res.json({
            total: Number(total.rows[0].count),
            hot: Number(hot.rows[0].count),
            warm: Number(warm.rows[0].count),
            cold: Number(cold.rows[0].count),
            enquiry: Number(enquiry.rows[0].count),
            testdrive: Number(testdrive.rows[0].count),
            closed: Number(closed.rows[0].count)
        });

    } catch (err) {
        console.error("Analytics Error:", err);
        res.status(500).json({ message: "Analytics failed" });
    }
});

module.exports = router;