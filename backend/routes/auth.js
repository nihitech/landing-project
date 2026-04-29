const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const auth = require("../middleware/auth");

const router = express.Router();

function requireAdmin(req, res, next) {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    next();
}

router.post("/register", auth, requireAdmin, async (req, res) => {
    try {
        const { name, email, password, role = "sales" } = req.body;
        const cleanEmail = String(email || "").trim().toLowerCase();
        const cleanRole = role === "admin" ? "admin" : "sales";

        if (!name || !cleanEmail || !password) return res.status(400).json({ message: "Name, email and password are required" });
        if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

        const existing = await db.query("SELECT id FROM users WHERE LOWER(email)=LOWER($1)", [cleanEmail]);
        if (existing.rows.length) return res.status(409).json({ message: "User already exists" });

        const hash = await bcrypt.hash(password, 10);
        const result = await db.query(
            `INSERT INTO users (name, email, password, role)
             VALUES ($1,$2,$3,$4)
             RETURNING id, name, email, role`,
            [name.trim(), cleanEmail, hash, cleanRole]
        );

        res.status(201).json({ message: "User created successfully", user: result.rows[0] });
    } catch (err) {
        console.error("REGISTER ERROR:", err);
        res.status(500).json({ message: "Register failed" });
    }
});

router.post("/login", async (req, res) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        if (!email || !password) return res.status(400).json({ message: "Email and password required" });

        const result = await db.query("SELECT * FROM users WHERE LOWER(email)=LOWER($1)", [email]);
        const user = result.rows[0];
        if (!user) return res.status(400).json({ message: "Invalid email or password" });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ message: "Invalid email or password" });

        const token = jwt.sign(
            { id: user.id, role: user.role, name: user.name },
            process.env.JWT_SECRET || "dev_secret_change_me",
            { expiresIn: "12h" }
        );

        delete user.password;
        res.json({ token, user });
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ message: "Login failed" });
    }
});

router.get("/me", auth, async (req, res) => {
    const result = await db.query("SELECT id, name, email, role FROM users WHERE id=$1", [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ message: "User not found" });
    res.json(result.rows[0]);
});

router.get("/users", auth, requireAdmin, async (req, res) => {
    try {
        const result = await db.query("SELECT id, name, email, role, created_at FROM users ORDER BY id DESC");
        res.json(result.rows);
    } catch (err) {
        console.error("Users fetch error:", err);
        res.status(500).json({ message: "Failed to fetch users" });
    }
});

router.delete("/user/:id", auth, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (id === Number(req.user.id)) return res.status(400).json({ message: "You cannot delete your own account" });

        await db.query("UPDATE leads SET assigned_to=NULL WHERE assigned_to=$1", [id]);
        await db.query("DELETE FROM users WHERE id=$1", [id]);
        res.json({ message: "User deleted and assigned leads moved to unassigned" });
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({ message: "Delete failed" });
    }
});

module.exports = router;
