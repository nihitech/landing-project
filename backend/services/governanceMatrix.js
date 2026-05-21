/*
  NIKRION Governance Matrix v2
  Human-management driven authority model.
  Admin is technical authority, not automatic business authority.
*/

const GOVERNANCE_MATRIX = {
    "SALES": {
        "rank": 10,
        "label": "Sales Executive",
        "data_scope": "OWN",
        "view": [
            "own_leads",
            "own_followups",
            "own_quick_enquiries",
            "vehicle_status_only",
            "own_bookings"
        ],
        "edit": [
            "followup_update",
            "call_disposition",
            "appointment_request",
            "quick_enquiry_create",
            "booking_request"
        ],
        "approval_required": [
            "critical_lead_edit",
            "lead_reassignment",
            "customer_phone_change",
            "vehicle_interest_change",
            "booking_confirmation"
        ],
        "approve": [],
        "reports": [
            "own_daily_report",
            "own_followup_report"
        ],
        "blocked": [
            "vehicle_master_modify",
            "stock_modify",
            "user_modify",
            "branch_modify",
            "department_modify",
            "cross_branch_leads"
        ]
    },
    "TEAM_LEADER": {
        "rank": 20,
        "label": "Team Leader",
        "data_scope": "TEAM",
        "view": [
            "team_leads",
            "team_followups",
            "vehicle_status",
            "team_quick_enquiries"
        ],
        "edit": [
            "team_followup_monitoring",
            "team_reassignment_request",
            "minor_lead_correction"
        ],
        "approval_required": [
            "branch_level_change",
            "vehicle_master_change",
            "stock_change"
        ],
        "approve": [
            "minor_sales_edit",
            "followup_exception"
        ],
        "reports": [
            "team_daily_report",
            "team_performance_report"
        ],
        "blocked": [
            "vehicle_master_modify",
            "stock_modify",
            "branch_modify",
            "department_modify"
        ]
    },
    "MANAGER": {
        "rank": 30,
        "label": "Sales Manager",
        "data_scope": "TEAM",
        "view": [
            "team_leads",
            "team_pipeline",
            "vehicle_status",
            "bookings",
            "quick_validation_queue",
            "field_activity_summary"
        ],
        "edit": [
            "team_reassignment",
            "lead_priority",
            "appointment_approval",
            "booking_review"
        ],
        "approval_required": [
            "vehicle_master_change",
            "branch_level_change",
            "organization_change"
        ],
        "approve": [
            "lead_edit_request",
            "booking_request",
            "sales_exception",
            "quick_enquiry_conversion"
        ],
        "reports": [
            "team_reports",
            "sales_reports",
            "followup_reports"
        ],
        "blocked": [
            "vehicle_master_modify",
            "stock_modify",
            "branch_modify",
            "department_modify",
            "user_role_modify"
        ]
    },
    "BM": {
        "rank": 40,
        "label": "Branch Manager",
        "data_scope": "BRANCH",
        "view": [
            "branch_leads",
            "branch_stock_status",
            "branch_bookings",
            "branch_delivery",
            "branch_reports",
            "team_performance"
        ],
        "edit": [
            "branch_sales_operations",
            "branch_reassignment",
            "branch_booking_approval",
            "branch_exception_resolution"
        ],
        "approval_required": [
            "vehicle_master_change",
            "stock_master_change",
            "department_change",
            "user_role_change"
        ],
        "approve": [
            "manager_requests",
            "lead_edit_request",
            "booking_confirmation",
            "branch_sales_exception"
        ],
        "reports": [
            "branch_auto_report",
            "branch_sales_report",
            "branch_productivity_report"
        ],
        "blocked": [
            "global_vehicle_master_modify",
            "department_modify",
            "company_settings_modify"
        ]
    },
    "DGM": {
        "rank": 50,
        "label": "Deputy General Manager",
        "data_scope": "REGION",
        "view": [
            "multi_branch_sales",
            "regional_stock_status",
            "regional_performance",
            "escalations"
        ],
        "edit": [
            "regional_reassignment",
            "regional_exception_resolution",
            "branch_performance_action"
        ],
        "approval_required": [
            "company_policy_change",
            "master_data_change"
        ],
        "approve": [
            "bm_requests",
            "regional_exceptions",
            "high_value_booking_exception"
        ],
        "reports": [
            "regional_reports",
            "multi_branch_reports",
            "escalation_reports"
        ],
        "blocked": [
            "system_settings_modify",
            "department_structure_modify"
        ]
    },
    "GM": {
        "rank": 60,
        "label": "General Manager",
        "data_scope": "ALL",
        "view": [
            "all_sales",
            "all_stock_status",
            "all_branch_performance",
            "business_intelligence"
        ],
        "edit": [
            "business_rules",
            "high_level_reassignment",
            "operational_policy"
        ],
        "approval_required": [
            "company_level_financial_policy",
            "system_security_change"
        ],
        "approve": [
            "dgm_requests",
            "business_exceptions",
            "vehicle_master_change"
        ],
        "reports": [
            "business_reports",
            "executive_reports",
            "forecast_reports"
        ],
        "blocked": [
            "technical_security_modify_without_admin"
        ]
    },
    "MD": {
        "rank": 70,
        "label": "Managing Director",
        "data_scope": "ALL",
        "view": [
            "enterprise_intelligence",
            "financial_summary",
            "all_departments",
            "audit_visibility"
        ],
        "edit": [
            "strategic_policy",
            "approval_policy",
            "business_control"
        ],
        "approval_required": [],
        "approve": [
            "gm_requests",
            "strategic_exceptions",
            "organization_change"
        ],
        "reports": [
            "executive_intelligence",
            "profitability_reports",
            "audit_reports"
        ],
        "blocked": []
    },
    "CEO": {
        "rank": 80,
        "label": "CEO",
        "data_scope": "ALL",
        "view": [
            "complete_business_intelligence",
            "all_reports",
            "audit",
            "ai_insights"
        ],
        "edit": [
            "strategic_control",
            "business_rules",
            "authority_policy"
        ],
        "approval_required": [],
        "approve": [
            "all_business_approvals",
            "critical_exceptions"
        ],
        "reports": [
            "enterprise_reports",
            "ai_recommendations",
            "predictive_reports"
        ],
        "blocked": []
    },
    "ADMIN": {
        "rank": 15,
        "label": "System Admin",
        "data_scope": "SYSTEM",
        "view": [
            "system_config",
            "users",
            "permissions",
            "technical_logs"
        ],
        "edit": [
            "system_config",
            "permissions_config",
            "integration_config"
        ],
        "approval_required": [
            "business_data_change"
        ],
        "approve": [
            "technical_configuration"
        ],
        "reports": [
            "system_reports"
        ],
        "blocked": [
            "business_approval_without_authority",
            "sales_decision_without_business_role"
        ]
    }
};

function clean(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function roleOf(user) {
    return clean(user?.role).toLowerCase();
}

function normalizeAuthority(value) {
    const v = clean(value).toUpperCase();
    return GOVERNANCE_MATRIX[v] ? v : "";
}

function authorityLevel(user) {
    const explicit = normalizeAuthority(user?.authority_level);
    if (explicit) return explicit;

    const role = roleOf(user);
    const map = {
        ceo: "CEO",
        md: "MD",
        managing_director: "MD",
        gm: "GM",
        general_manager: "GM",
        dgm: "DGM",
        deputy_general_manager: "DGM",
        bm: "BM",
        branch_manager: "BM",
        manager: "MANAGER",
        sales_manager: "MANAGER",
        team_leader: "TEAM_LEADER",
        admin: "ADMIN",
        super_admin: "ADMIN",
        system_admin: "ADMIN"
    };

    return map[role] || "SALES";
}

function matrixFor(userOrLevel) {
    const level = typeof userOrLevel === "string" ? normalizeAuthority(userOrLevel) : authorityLevel(userOrLevel);
    return GOVERNANCE_MATRIX[level] || GOVERNANCE_MATRIX.SALES;
}

function rank(userOrLevel) {
    return matrixFor(userOrLevel).rank || 10;
}

function dataScope(user) {
    const explicit = clean(user?.data_scope || user?.role_data_scope).toUpperCase();
    if (["OWN", "TEAM", "BRANCH", "REGION", "ALL", "SYSTEM"].includes(explicit)) return explicit;
    return matrixFor(user).data_scope || "OWN";
}

function hasPermission(user, key) {
    return Array.isArray(user?.permissions) && user.permissions.includes(key);
}

function can(user, action) {
    const m = matrixFor(user);
    if (hasPermission(user, action)) return true;

    const all = [
        ...(m.view || []),
        ...(m.edit || []),
        ...(m.approve || []),
        ...(m.reports || [])
    ];

    return all.includes(action);
}

function isBlocked(user, action) {
    const m = matrixFor(user);
    return (m.blocked || []).includes(action) && !hasPermission(user, action);
}

function requiresApproval(user, action) {
    const m = matrixFor(user);
    return (m.approval_required || []).includes(action) && !hasPermission(user, `${action}.direct`);
}

function canApprove(user, action) {
    const m = matrixFor(user);
    return (m.approve || []).includes(action) || hasPermission(user, `${action}.approve`);
}

function canViewVehicleDashboard(user) {
    return can(user, "vehicle_status") || can(user, "all_stock_status") || can(user, "branch_stock_status") || can(user, "regional_stock_status");
}

function canModifyVehicleMaster(user) {
    return can(user, "vehicle_master_change") || can(user, "vehicle.modify");
}

function canModifyOrganization(user) {
    return can(user, "organization_change") || can(user, "organization.modify");
}

function leadCriticalFields() {
    return [
        "phone", "alternate_phone", "email", "name", "customer_name", "source",
        "assigned_to", "branch_id", "assigned_branch_id",
        "vehicle_category", "car_interest", "variant_interest", "preferred_color", "fuel_type",
        "budget", "exchange_required", "finance_required"
    ];
}

function needsLeadEditApproval(user, changes = {}) {
    const keys = Object.keys(changes || {});
    const isCritical = keys.some(k => leadCriticalFields().includes(k));
    if (!isCritical) return false;
    return requiresApproval(user, "critical_lead_edit") || authorityLevel(user) === "SALES";
}

function appendLeadScope(req, alias = "l", values = []) {
    const user = req.user || {};
    const scope = dataScope(user);
    const clauses = [];

    if (scope === "ALL") return { clauses, values };

    if (scope === "OWN") {
        values.push(user.id);
        clauses.push(`${alias}.assigned_to = $${values.length}`);
        return { clauses, values };
    }

    if (["TEAM", "BRANCH", "REGION"].includes(scope)) {
        if (user.branch_id) {
            values.push(user.branch_id);
            clauses.push(`COALESCE(${alias}.branch_id, ${alias}.assigned_branch_id) = $${values.length}`);
        } else {
            values.push(user.id);
            clauses.push(`${alias}.assigned_to = $${values.length}`);
        }
    }

    if (scope === "SYSTEM") {
        values.push(user.id);
        clauses.push(`${alias}.assigned_to = $${values.length}`);
    }

    return { clauses, values };
}

module.exports = {
    GOVERNANCE_MATRIX,
    authorityLevel,
    matrixFor,
    rank,
    dataScope,
    hasPermission,
    can,
    isBlocked,
    requiresApproval,
    canApprove,
    canViewVehicleDashboard,
    canModifyVehicleMaster,
    canModifyOrganization,
    leadCriticalFields,
    needsLeadEditApproval,
    appendLeadScope
};
