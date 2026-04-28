const twilio = require("twilio");

// Initialize client using environment variables
const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// 🔹 Send WhatsApp Message
const sendWhatsApp = async (to, message) => {
    try {
        console.log("📤 Sending to:", to);
        console.log("📲 From:", process.env.TWILIO_WHATSAPP_NUMBER);

        const res = await client.messages.create({
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: to,
            body: message
        });
    
        console.log("✅ WhatsApp sent:", res.sid);
    }
        catch (error) 
        {
        console.error("❌ FULL ERROR:", error);

        if (error.response) {
            console.error("🔴 Twilio Response:", error.response.data);
        }

        console.error("Message:", error.message);
        console.error("Code:", error.code);
        }
};

module.exports = sendWhatsApp;