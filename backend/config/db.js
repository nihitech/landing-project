const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect()
    .then(() => console.log("PostgreSQL Connected (Supabase)"))
    .catch(err => console.error("DB Connection Failed:", err));

module.exports = pool;