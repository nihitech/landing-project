const db = require("../config/db");

function cleanText(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function toJson(value) {
    try {
        return JSON.stringify(value || {});
    } catch (err) {
        return "{}";
    }
}

async function ensureActivityLogSchema() {
    await db.query(`
        ALTER TABLE activity_logs
        ADD COLUMN IF NOT EXISTS module_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100),
        ADD COLUMN IF NOT EXISTS entity_id INTEGER,
        ADD COLUMN IF NOT EXISTS branch_id INTEGER,
        ADD COLUMN IF NOT EXISTS company_id INTEGER,
        ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100),
        ADD COLUMN IF NOT EXISTS user_agent TEXT,
        ADD COLUMN IF NOT EXISTS severity VARCHAR(40) DEFAULT 'INFO',
        ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb
    `);
}

async function logActivity({
    lead_id = null,
    user_id = null,
    action,
    old_value = "",
    new_value = "",
    remarks = "",
    module_name = "GENERAL",
    entity_type = "GENERAL",
    entity_id = null,
    branch_id = null,
    company_id = null,
    severity = "INFO",
    metadata = {},
    req = null
}) {
    try {
        if (!action) return;

        await ensureActivityLogSchema();

        const ip =
            req?.headers?.["x-forwarded-for"] ||
            req?.socket?.remoteAddress ||
            "";

        const userAgent = req?.headers?.["user-agent"] || "";

        await db.query(`
            INSERT INTO activity_logs
            (
                lead_id,
                user_id,
                action,
                old_value,
                new_value,
                remarks,
                module_name,
                entity_type,
                entity_id,
                branch_id,
                company_id,
                ip_address,
                user_agent,
                severity,
                metadata
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `, [
            lead_id,
            user_id,
            cleanText(action),
            cleanText(old_value),
            cleanText(new_value),
            cleanText(remarks),
            cleanText(module_name || "GENERAL").toUpperCase(),
            cleanText(entity_type || "GENERAL").toUpperCase(),
            entity_id,
            branch_id,
            company_id,
            cleanText(ip),
            cleanText(userAgent),
            cleanText(severity || "INFO").toUpperCase(),
            toJson(metadata)
        ]);

    } catch (err) {
        console.error("ACTIVITY LOGGER ERROR:", err.message);
    }
}

module.exports = {
    logActivity,
    ensureActivityLogSchema
};
