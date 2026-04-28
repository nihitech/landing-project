const sendWhatsApp = require("./whatsapp");

function scheduleFollowUps(lead) {

    const phone = `whatsapp:+91${lead.phone}`;

    // ⏱ 5 MIN FOLLOW-UP
    setTimeout(() => {
        sendWhatsApp(phone,
`Hi ${lead.name},

Just checking 😊

Would you like to book a test drive for ${lead.car_interest}?

Reply YES to continue.`);
    }, 5 * 60 * 1000);


    // ⏱ 1 DAY FOLLOW-UP
    setTimeout(() => {
        sendWhatsApp(phone,
`Hi ${lead.name},

We have special offers on ${lead.car_interest} today 🚗

Let me know if you're interested.`);
    }, 24 * 60 * 60 * 1000);


    // ⏱ 3 DAY FINAL PUSH
    setTimeout(() => {
        sendWhatsApp(phone,
`Hi ${lead.name},

Last reminder for exclusive offers on ${lead.car_interest} 🔥

Shall we assist you with booking?`);
    }, 3 * 24 * 60 * 60 * 1000);
}

module.exports = scheduleFollowUps;