const cron = require("node-cron");
const db = require("../config/db");
const sendWhatsApp = require("./whatsapp");

cron.schedule("* * * * *", async () => {
    console.log("⏱ Checking follow-ups...");

    const now = new Date();

    // FOLLOW-UP 1
    db.query(
        "SELECT * FROM leads WHERE followup_1 <= $1 AND f1_sent = FALSE",
        [now],
        (err, results) => {
            if (!err) {
                results.rows.forEach(lead => {
                    sendWhatsApp(
                        `whatsapp:+91${lead.phone}`,
`Hi ${lead.name},

Just checking 😊

Would you like to book a test drive for ${lead.car_interest}?`
                    );

                    db.query("UPDATE leads SET f1_sent = TRUE WHERE id = $1", [lead.id]);
                });
            }
        }
    );

    // FOLLOW-UP 2
    db.query(
        "SELECT * FROM leads WHERE followup_2 <= $1 AND f2_sent = FALSE",
        [now],
        (err, results) => {
            if (!err) {
                results.rows.forEach(lead => {
                    sendWhatsApp(
                        `whatsapp:+91${lead.phone}`,
`Hi ${lead.name},

We have special offers on ${lead.car_interest} today 🚗`
                    );

                    db.query("UPDATE leads SET f2_sent = TRUE WHERE id = $1", [lead.id]);
                });
            }
        }
    );

    // FOLLOW-UP 3
    db.query(
        "SELECT * FROM leads WHERE followup_3 <= $1 AND f3_sent = FALSE",
        [now],
        (err, results) => {
            if (!err) {
                results.rows.forEach(lead => {
                    sendWhatsApp(
                        `whatsapp:+91${lead.phone}`,
`Hi ${lead.name},

Last reminder 🔥

Shall we help you book ${lead.car_interest}?`
                    );

                    db.query("UPDATE leads SET f3_sent = TRUE WHERE id = $1", [lead.id]);
                });
            }
        }
    );

});