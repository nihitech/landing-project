const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");

router.get("/", auth, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                id,
                branch_name,
                branch_code
            FROM branches
            ORDER BY branch_name ASC, id ASC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("BRANCH LIST ERROR:", err);
        res.status(500).json({
            message: "Failed to load branches"
        });
    }
});

module.exports = router;