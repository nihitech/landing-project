const cron = require("node-cron");
const db = require("../config/db");
const sendWhatsApp = require("./whatsapp");
const cron = require("node-cron");

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

console.log("⏱ Follow-up cron started...");

cron.schedule("* * * * *", async () => {
    try {
        console.log("⏱ Checking follow-ups...");

        const now = new Date();

        await processFollowUp(
            "followup_1",
            "f1_sent",
            `Just checking 😊

Would you like to book a test drive?`,
            now
        );

        await processFollowUp(
            "followup_2",
            "f2_sent",
            `We have special offers today 🚗

Let me know if you're interested.`,
            now
        );

        await processFollowUp(
            "followup_3",
            "f3_sent",
            `Last reminder 🔥

Shall we help you with booking?`,
            now
        );

    } catch (error) {
        console.error("Follow-up cron error:", error.message);
    }
});

async function processFollowUp(followupColumn, sentColumn, messageText, now) {
    const query = `
        SELECT * FROM leads
        WHERE ${followupColumn} <= $1
        AND ${sentColumn} = false
    `;

    const result = await db.query(query, [now]);
    const leads = result.rows;

    for (const lead of leads) {
        try {
            await sendWhatsApp(
                `whatsapp:+91${lead.phone}`,
                `Hi ${lead.name},

${messageText}

Car Interest: ${lead.car_interest || "Mahindra"}

- Shiva Automobiles`
            );

            await db.query(
                `UPDATE leads SET ${sentColumn} = true WHERE id = $1`,
                [lead.id]
            );

            console.log(`✅ ${sentColumn} sent for lead:`, lead.id);

        } catch (error) {
            console.error(`❌ ${sentColumn} failed for lead ${lead.id}:`, error.message);
        }
    }
}

module.exports = {};