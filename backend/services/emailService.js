const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function sendEmail({ to, cc = "", subject, html, text = "" }) {
    if (!to) {
        throw new Error("Email recipient is required");
    }

    return transporter.sendMail({
        from: `"${process.env.REPORT_FROM_NAME || "CRM Reports"}" <${process.env.SMTP_USER}>`,
        to,
        cc,
        subject,
        html,
        text
    });
}

module.exports = {
    sendEmail,
    sendEmailReport: sendEmail
};