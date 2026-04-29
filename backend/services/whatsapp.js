let client = null;

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require("twilio");
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function sendWhatsApp(to, message) {
    if (!client || !process.env.TWILIO_WHATSAPP_NUMBER) {
        console.log("WhatsApp skipped: Twilio env not configured", { to, message });
        return { skipped: true };
    }

    try {
        const res = await client.messages.create({
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to,
            body: message
        });
        console.log("WhatsApp sent:", res.sid);
        return res;
    } catch (error) {
        console.error("WhatsApp failed:", error.message);
        throw error;
    }
}

module.exports = sendWhatsApp;
