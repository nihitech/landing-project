const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

module.exports = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const token = authHeader.startsWith("Bearer ")
            ? authHeader.split(" ")[1]
            : authHeader;

        const decoded = jwt.verify(token, JWT_SECRET);

        req.user = {
            id: decoded.id,
            name: decoded.name || "",
            email: decoded.email || "",
            phone: decoded.phone || "",
            role: String(decoded.role || "sales").trim().toLowerCase(),

            department_id: decoded.department_id || null,
            department_name: decoded.department_name || "",
            department_code: decoded.department_code || "",

            branch_id: decoded.branch_id || null,
            branch_name: decoded.branch_name || "",
            branch_code: decoded.branch_code || "",

            designation: decoded.designation || "",
            manager_id: decoded.manager_id || null,
            data_scope: decoded.data_scope || "OWN",
            vehicle_category_scope: decoded.vehicle_category_scope || "ALL",
            is_higher_authority: ["admin", "super_admin", "owner", "director", "ceo"]
                .includes(String(decoded.role || "").trim().toLowerCase()),


            can_view: decoded.can_view !== false,
            can_create: decoded.can_create === true,
            can_edit: decoded.can_edit === true,
            can_assign: decoded.can_assign === true,
            can_delete: decoded.can_delete === true,
            can_export: decoded.can_export === true,
            can_monitor: decoded.can_monitor === true,

            permissions: Array.isArray(decoded.permissions)
                ? decoded.permissions
                : []
        };

        next();

    } catch (error) {
        console.error("AUTH ERROR:", error.message);
        return res.status(401).json({ message: "Invalid token" });
    }
};