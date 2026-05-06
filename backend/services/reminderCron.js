const cron = require("node-cron");
const db = require("../config/db");
const sendWhatsApp = require("./whatsapp");

cron.schedule("*/5 * * * *", async () => {
    try {
        console.log("🔔 Checking follow-up reminders...");

        const result = await db.query(`
            SELECT 
                l.id,
                l.name AS customer_name,
                l.phone AS customer_phone,
                l.car_interest,
                l.next_followup_at,
                u.name AS sales_name,
                u.phone AS sales_phone
            FROM leads l
            JOIN users u ON l.assigned_to = u.id
            WHERE l.next_followup_at IS NOT NULL
            AND l.reminder_sent = false
            AND l.status NOT IN ('CLOSED', 'LOST')
            AND l.next_followup_at BETWEEN NOW() AND NOW() + INTERVAL '30 minutes'
            AND u.phone IS NOT NULL
        `);

        for (const lead of result.rows) {
            await sendWhatsApp(
                `whatsapp:+${lead.sales_phone}`,
                `🔔 Follow-up Reminder

Customer: ${lead.customer_name}
Phone: ${lead.customer_phone}
Car: ${lead.car_interest || "Not Selected"}
Follow-up Time: ${new Date(lead.next_followup_at).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata"
                })}

Please contact the customer on time.`
            );

            await db.query(
                "UPDATE leads SET reminder_sent = true WHERE id = $1",
                [lead.id]
            );

            console.log("✅ Reminder sent:", lead.id);
        }

    } catch (error) {
        console.error("Reminder cron error:", error.message);
    }
});