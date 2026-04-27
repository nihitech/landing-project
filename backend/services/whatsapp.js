const twilio = require("twilio");

// Initialize client using environment variables
const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// 🔹 Send WhatsApp Message
const sendWhatsApp = async (to, message) => {
    try {
        await client.messages.create({
            from: process.env.TWILIO_WHATSAPP_NUMBER, // e.g., 'whatsapp:+14155238886'
            to: to, // must be full format: 'whatsapp:+91XXXXXXXXXX'
            body: message
        });

        console.log("WhatsApp sent to:", to);
    } catch (error) {
        console.error("WhatsApp Error:", error.message);
    }
};

module.exports = sendWhatsApp;