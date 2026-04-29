const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// 🔹 REGISTER
router.post("/register", async (req, res) => {
    try {
        console.log("Incoming register:", req.body);

        const { name, email, password, role } = req.body;

        // 🔹 Validation
        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields required" });
        }

        // 🔹 Check existing user
        const existing = await db.query(
            "SELECT * FROM users WHERE email=$1",
            [email]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ message: "User already exists" });
        }

        // 🔹 Hash password
        const bcrypt = require("bcrypt");
        const hash = await bcrypt.hash(password, 10);

        // 🔹 Insert user
        await db.query(
            "INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4)",
            [name, email, hash, role || "sales"]
        );

        res.json({ message: "User created successfully" });

    } catch (err) {
        console.error("REGISTER ERROR:", err); // 🔥 IMPORTANT LOG
        res.status(500).json({ message: "Register failed", error: err.message });
    }
});
// 🔹 LOGIN
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const result = await db.query(
        "SELECT * FROM users WHERE email=$1",
        [email]
    );

    const user = result.rows[0];

    if (!user) return res.status(400).json({ message: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: "Wrong password" });

    const token = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET
    );

    res.json({ token, user });
});
// 🔹 GET ALL USERS
router.get("/users", async (req, res) => {
    try {
        const result = await db.query(
            "SELECT id, name, email, role FROM users ORDER BY id DESC"
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Users fetch error:", err);
        res.status(500).json({ message: "Failed to fetch users" });
    }
});

// 🔹 DELETE USER
router.delete("/user/:id", async (req, res) => {
    try {
        await db.query("DELETE FROM users WHERE id = $1", [req.params.id]);
        res.json({ message: "User deleted" });
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({ message: "Delete failed" });
    }
});
module.exports = router;