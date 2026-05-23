/*
  NIKRION Role Access Service v1
  Centralized role alias normalization for safer module access.
*/

function clean(value, fallback = "") {
    return String(value ?? fallback).trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

function normalizeRole(value) {
    const role = clean(value);

    const aliases = {
        superadmin: "super_admin",
        systemadmin: "system_admin",
        sys_admin: "system_admin",

        reception: "receptionist",
        frontoffice: "receptionist",
        front_office: "receptionist",
        frontdesk: "receptionist",
        front_desk: "receptionist",
        cre: "receptionist",
        customer_relation_executive: "receptionist",
        customer_relations_executive: "receptionist",

        sales: "sales",
        salesperson: "sales",
        sales_person: "sales",
        sales_executive: "sales",
        sales_consultant: "sales",
        sales_advisor: "sales",

        teamleader: "team_leader",
        tl: "team_leader",
        sales_manager: "manager",
        branch_manager: "branch_manager",
        bm: "branch_manager",

        crm: "telecaller",
        crm_executive: "telecaller",
        tele_caller: "telecaller",

        field_executive: "field",
        field_sales: "field",

        digital_marketing: "digital_marketing",
        digital_marketer: "digital_marketing",
        digital_marketing_manager: "digital_marketing",
        marketing_manager: "digital_marketing",
        online_marketing: "digital_marketing",

        telecalling: "telecaller",
        telecaller_team: "telecaller",
        tele_calling: "telecaller"
    };

    return aliases[role] || role;
}

function roleOf(userOrRole) {
    if (typeof userOrRole === "string") return normalizeRole(userOrRole);
    return normalizeRole(userOrRole?.role);
}

function isAdmin(userOrRole) {
    return ["admin", "super_admin", "system_admin", "owner", "director", "ceo"].includes(roleOf(userOrRole));
}

function isReception(userOrRole) {
    return roleOf(userOrRole) === "receptionist";
}

function isSales(userOrRole) {
    return roleOf(userOrRole) === "sales";
}

function isManager(userOrRole) {
    return ["manager", "team_leader", "branch_manager", "dgm", "gm", "md", "ceo", "admin", "super_admin"].includes(roleOf(userOrRole));
}

function isTelecaller(userOrRole) {
    return roleOf(userOrRole) === "telecaller";
}

function isField(userOrRole) {
    return roleOf(userOrRole) === "field";
}

function isDigitalMarketing(userOrRole) {
    return roleOf(userOrRole) === "digital_marketing";
}

function hasPermission(user, key) {
    if (isAdmin(user)) return true;
    return Array.isArray(user?.permissions) && user.permissions.includes(key);
}

module.exports = {
    clean,
    normalizeRole,
    roleOf,
    isAdmin,
    isReception,
    isSales,
    isManager,
    isTelecaller,
    isField,
    isDigitalMarketing,
    hasPermission
};
