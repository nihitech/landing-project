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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            JSON.stringify(tracking),
            score,
            priority,
            "NEW" // 🔥 ensure default status
        ];

        db.query(sql, values, (err, result) => {
            if (err) {
                console.error("DB Error:", err);
                return res.status(500).json({ message: "Database error" });
            }

            console.log("✅ Lead saved:", result.insertId);

            // 🔹 Send WhatsApp (non-blocking)
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
                id: result.insertId,
                score,
                priority
            });
        });

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ message: "Server error" });
    }
});


// 🔹 GET: Fetch all leads
router.get("/leads", (req, res) => {
    db.query("SELECT * FROM leads ORDER BY id DESC", (err, results) => {
        if (err) {
            console.error("Fetch Error:", err);
            return res.status(500).json({ message: "Error fetching leads" });
        }

        res.json(results);
    });
});


// 🔹 UPDATE STATUS (WITH VALIDATION)
router.put("/lead/:id/status", (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatus = ["NEW", "CONTACTED", "FOLLOW-UP", "CLOSED"];

    if (!allowedStatus.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }

    const sql = "UPDATE leads SET status = ? WHERE id = ?";

    db.query(sql, [status, id], (err) => {
        if (err) {
            console.error("Status Update Error:", err);
            return res.status(500).json({ message: "Update failed" });
        }

        res.json({ message: "Status updated successfully" });
    });
});
router.get("/analytics", (req, res) => {
    const queries = {
        total: "SELECT COUNT(*) AS total FROM leads",
        hot: "SELECT COUNT(*) AS hot FROM leads WHERE priority='HOT'",
        warm: "SELECT COUNT(*) AS warm FROM leads WHERE priority='WARM'",
        cold: "SELECT COUNT(*) AS cold FROM leads WHERE priority='COLD'",
        enquiry: "SELECT COUNT(*) AS enquiry FROM leads WHERE action_type='enquiry'",
        testdrive: "SELECT COUNT(*) AS testdrive FROM leads WHERE action_type='test_drive'",
        closed: "SELECT COUNT(*) AS closed FROM leads WHERE status='CLOSED'"
    };

    const results = {};

    const keys = Object.keys(queries);
    let completed = 0;

    keys.forEach(key => {
        db.query(queries[key], (err, result) => {
            if (err) {
                console.error("Analytics Error:", err);
                return res.status(500).json({ message: "Analytics failed" });
            }

            results[key] = result[0][key];
            completed++;

            if (completed === keys.length) {
                res.json(results);
            }
        });
    });
});
module.exports = router;