const { Pool } = require("pg");

const useSSL = process.env.DB_SSL === "true";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSSL
        ? {
            rejectUnauthorized: false
        }
        : false
});

pool.connect()
    .then(() => console.log("✅ DB Connected"))
    .catch(err => console.error("DB Connection Failed:", err.message));

module.exports = pool;