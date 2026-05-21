/*
  NIKRION Branch-Level Access Control v1

  Goals:
  - Admin/CEO can access all data.
  - Branch manager / manager sees only own branch data.
  - Sales/field users see own data by default.
  - Permission flags control actions: view/create/edit/delete/export.
*/

function clean(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function roleOf(req) {
    return clean(req.user?.role).toLowerCase();
}

function isHigherAuthority(req) {
    const role = roleOf(req);
    return req.user?.is_higher_authority === true ||
        ["admin", "super_admin", "owner", "director", "ceo"].includes(role);
}

function isBranchLevelManager(req) {
    const role = roleOf(req);
    return ["manager", "branch_manager", "team_leader", "sales_manager"].includes(role);
}

function isOwnDataRole(req) {
    const role = roleOf(req);
    return ["sales", "sales_executive", "sales_consultant", "field", "field_executive", "telecaller"].includes(role);
}

function permissions(req) {
    return Array.isArray(req.user?.permissions) ? req.user.permissions : [];
}

function hasPermission(req, key) {
    if (isHigherAuthority(req)) return true;
    return permissions(req).includes(key);
}

function hasAnyPermission(req, keys = []) {
    if (isHigherAuthority(req)) return true;
    return keys.some(key => hasPermission(req, key));
}

function canView(req, moduleName = "") {
    if (isHigherAuthority(req)) return true;
    if (req.user?.can_view === true) return true;
    if (!moduleName) return true;
    return hasAnyPermission(req, [`${moduleName}.view`, `${moduleName}.manage`, `${moduleName}.review`]);
}

function canCreate(req, moduleName = "") {
    if (isHigherAuthority(req)) return true;
    if (req.user?.can_create === true) return true;
    if (!moduleName) return false;
    return hasAnyPermission(req, [`${moduleName}.create`, `${moduleName}.manage`]);
}

function canEdit(req, moduleName = "") {
    if (isHigherAuthority(req)) return true;
    if (req.user?.can_edit === true) return true;
    if (!moduleName) return false;
    return hasAnyPermission(req, [`${moduleName}.edit`, `${moduleName}.manage`, `${moduleName}.review`]);
}

function canDelete(req, moduleName = "") {
    if (isHigherAuthority(req)) return true;
    if (req.user?.can_delete === true) return true;
    if (!moduleName) return false;
    return hasAnyPermission(req, [`${moduleName}.delete`, `${moduleName}.manage`]);
}

function requireView(moduleName = "") {
    return (req, res, next) => {
        if (!canView(req, moduleName)) {
            return res.status(403).json({ message: "You do not have permission to view this data" });
        }
        next();
    };
}

function requireCreate(moduleName = "") {
    return (req, res, next) => {
        if (!canCreate(req, moduleName)) {
            return res.status(403).json({ message: "You do not have permission to create this data" });
        }
        next();
    };
}

function requireEdit(moduleName = "") {
    return (req, res, next) => {
        if (!canEdit(req, moduleName)) {
            return res.status(403).json({ message: "You do not have permission to edit this data" });
        }
        next();
    };
}

function requireDelete(moduleName = "") {
    return (req, res, next) => {
        if (!canDelete(req, moduleName)) {
            return res.status(403).json({ message: "You do not have permission to delete this data" });
        }
        next();
    };
}

/*
  Adds safe data-scope SQL clause.
  alias = table alias.
  branchColumn = branch column name.
  ownerColumn = assigned/created owner column.
*/
function appendDataScope(req, clauses, values, alias, options = {}) {
    if (isHigherAuthority(req)) return;

    const branchColumn = options.branchColumn || "branch_id";
    const ownerColumn = options.ownerColumn || "assigned_to";
    const includeCreatedBy = options.includeCreatedBy === true;
    const createdByColumn = options.createdByColumn || "created_by";

    if (isBranchLevelManager(req) && req.user?.branch_id) {
        values.push(req.user.branch_id);
        clauses.push(`${alias}.${branchColumn} = $${values.length}`);
        return;
    }

    if (isOwnDataRole(req) && req.user?.id) {
        values.push(req.user.id);
        const idx = values.length;
        const ownerParts = [`${alias}.${ownerColumn} = $${idx}`];

        if (includeCreatedBy) {
            ownerParts.push(`${alias}.${createdByColumn} = $${idx}`);
        }

        if (req.user?.branch_id && options.allowBranchFallback === true) {
            values.push(req.user.branch_id);
            ownerParts.push(`${alias}.${branchColumn} = $${values.length}`);
        }

        clauses.push(`(${ownerParts.join(" OR ")})`);
        return;
    }

    if (req.user?.branch_id) {
        values.push(req.user.branch_id);
        clauses.push(`${alias}.${branchColumn} = $${values.length}`);
    }
}

function requireSameBranchOrAdmin(getBranchId) {
    return async (req, res, next) => {
        if (isHigherAuthority(req)) return next();

        const targetBranchId = typeof getBranchId === "function"
            ? await getBranchId(req)
            : getBranchId;

        if (!targetBranchId || Number(targetBranchId) !== Number(req.user?.branch_id)) {
            return res.status(403).json({ message: "You can access only your branch data" });
        }

        next();
    };
}

module.exports = {
    isHigherAuthority,
    isBranchLevelManager,
    isOwnDataRole,
    hasPermission,
    hasAnyPermission,
    canView,
    canCreate,
    canEdit,
    canDelete,
    requireView,
    requireCreate,
    requireEdit,
    requireDelete,
    appendDataScope,
    requireSameBranchOrAdmin
};
