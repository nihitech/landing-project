const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : header;

    if (!token) return res.status(401).json({ message: "Unauthorized" });

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET || "dev_secret_change_me");
        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};
