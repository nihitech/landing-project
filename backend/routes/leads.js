const express = require("express");
const router = express.Router();

const db = require("../config/db");
const sendWhatsApp = require("../services/whatsapp");
const { calculateScore, getLeadPriority } = require("../services/scoring");


// 🔹 POST: Save Lead
router.post("/lead", async (req, res) => {
    try {
        const data = req.body;

        console.log("Incoming Lead:", data);

        // 🔹 Validation
        if (!data.name || !data.phone) {
            return res.status(400).json({ message: "Name & Phone required" });
        }

        const tracking = data.tracking || {};

        const score = calculateScore({ ...data, tracking });
        const priority = getLeadPriority(score);

        const sql = `
            INSERT INTO leads 
            (name, phone, email, area, district, profession, car_interest, action_type, tracking, score, priority, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
            data.action_type || "Enquiry",
            tracking, // ✅ JSON directly (no stringify)
            score,
            priority,
            "NEW"
        ];

        // ✅ PostgreSQL query
        const result = await db.query(sql, values);

        const leadId = result.rows[0].id;

        console.log("✅ Lead saved:", leadId);

        // 🔹 WhatsApp (NON-BLOCKING)
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
Action: ${data.action_type || "Enquiry"}

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


// 🔹 GET: Fetch all leads
router.get("/leads", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM leads ORDER BY id DESC");
        res.json(result.rows);
    } catch (err) {
        console.error("Fetch Error:", err);
        res.status(500).json({ message: "Error fetching leads" });
    }
});


// 🔹 UPDATE STATUS
router.put("/lead/:id/status", async (req, res) => {
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


// 🔹 ANALYTICS (FIXED FOR POSTGRES)
router.get("/analytics", async (req, res) => {
    try {
        const total = await db.query("SELECT COUNT(*) FROM leads");
        const hot = await db.query("SELECT COUNT(*) FROM leads WHERE priority='HOT'");
        const warm = await db.query("SELECT COUNT(*) FROM leads WHERE priority='WARM'");
        const cold = await db.query("SELECT COUNT(*) FROM leads WHERE priority='COLD'");
        const enquiry = await db.query("SELECT COUNT(*) FROM leads WHERE action_type='Enquiry'");
        const testdrive = await db.query("SELECT COUNT(*) FROM leads WHERE action_type='Test Drive'");
        const closed = await db.query("SELECT COUNT(*) FROM leads WHERE status='CLOSED'");

        res.json({
            total: total.rows[0].count,
            hot: hot.rows[0].count,
            warm: warm.rows[0].count,
            cold: cold.rows[0].count,
            enquiry: enquiry.rows[0].count,
            testdrive: testdrive.rows[0].count,
            closed: closed.rows[0].count
        });

    } catch (err) {
        console.error("Analytics Error:", err);
        res.status(500).json({ message: "Analytics failed" });
    }
});

module.exports = router;