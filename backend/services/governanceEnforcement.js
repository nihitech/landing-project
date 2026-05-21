/*
  NIKRION Governance Enforcement Layer v1
  Applies Governance Matrix v2 to route-level access.
*/

const governance = require("./governanceMatrix");

function clean(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function requireVehicleMasterModify(req, res, next) {
    if (!governance.canModifyVehicleMaster(req.user)) {
        return res.status(403).json({
            message: "Vehicle master modification requires GM/MD/CEO level authority or explicit vehicle.modify permission"
        });
    }
    next();
}

function requireReportAccess(req, res, next) {
    if (!governance.canGenerateReports(req.user)) {
        return res.status(403).json({
            message: "Report generation requires manager/BM/DGM/GM/MD/CEO level authority or explicit reports.generate permission"
        });
    }
    next();
}

function requireOrganizationModify(req, res, next) {
    if (!governance.canModifyOrganization(req.user)) {
        return res.status(403).json({
            message: "Organization/branch/department modification requires MD/CEO level authority or explicit organization.modify permission"
        });
    }
    next();
}

function appendLeadScope(req, alias = "l", values = []) {
    return governance.appendLeadScope(req, alias, values);
}

function requireLeadDirectEditOrApproval(req, res, next) {
    const changes = req.body || {};

    if (governance.needsLeadEditApproval(req.user, changes)) {
        return res.status(403).json({
            message: "Critical lead changes require higher-authority approval. Submit a governance approval request.",
            approval_required: true,
            approval_endpoint: "/api/governance/approval-requests",
            request_type: "CRITICAL_LEAD_EDIT"
        });
    }

    next();
}

function roleGuardSnapshot(req, res, next) {
    req.governance = {
        authority_level: governance.authorityLevel(req.user),
        data_scope: governance.dataScope(req.user),
        can_view_vehicle_dashboard: governance.canViewVehicleDashboard(req.user),
        can_modify_vehicle_master: governance.canModifyVehicleMaster(req.user),
        can_modify_organization: governance.canModifyOrganization(req.user),
        can_generate_reports: governance.canGenerateReports(req.user)
    };
    next();
}

module.exports = {
    requireVehicleMasterModify,
    requireReportAccess,
    requireOrganizationModify,
    requireLeadDirectEditOrApproval,
    appendLeadScope,
    roleGuardSnapshot
};
