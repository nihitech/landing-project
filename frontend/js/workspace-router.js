function normalizeRoleValue(role){return String(role||"").trim().toLowerCase();}
function normalizeDepartmentValue(dept){return String(dept||"").trim().toLowerCase().replace(/\s+/g,"_");}
function getWorkspaceUrl(user){
 const role=normalizeRoleValue(user?.role);
 const dept=normalizeDepartmentValue(user?.department_name||user?.department||user?.department_code);
 if(["admin","super_admin","owner","director","ceo"].includes(role)) return allowedWorkspace(user, "dashboard.html");
 if(["receptionist","front_desk"].includes(role)||dept.includes("reception")) return allowedWorkspace(user, "receptionist-dashboard.html");
 if(["telecaller","crm_executive","customer_validator"].includes(role)||dept.includes("tele")||dept.includes("crm")) return allowedWorkspace(user, "telecaller-dashboard.html");
 if(["manager","branch_manager","team_leader","sales_manager"].includes(role)) return allowedWorkspace(user, "manager-dashboard.html");
 if(["field","field_executive","campaign_promoter"].includes(role)||dept.includes("field")) return allowedWorkspace(user, "field-dashboard.html");
 if(["sales","sales_executive","sales_consultant"].includes(role)||dept.includes("sales")) return allowedWorkspace(user, "sales-dashboard.html");
 if(dept.includes("delivery")||role.includes("delivery")) return allowedWorkspace(user, "delivery-dashboard.html");
 if(dept.includes("finance")||dept.includes("insurance")||role.includes("finance")) return allowedWorkspace(user, "finance-dashboard.html");
 if(dept.includes("service")||role.includes("service")) return allowedWorkspace(user, "service-dashboard.html");
 if(dept.includes("marketing")||role.includes("marketing")) return allowedWorkspace(user, "marketing-dashboard.html");
 return allowedWorkspace(user, "sales-dashboard.html");
}
window.getWorkspaceUrl=getWorkspaceUrl;

function allowedWorkspace(user, preferred) {
    const role = String(user?.role || "").toLowerCase();
    if (["admin","super_admin","owner","director","ceo"].includes(role) || user?.is_higher_authority === true) return preferred;

    const access = Array.isArray(user?.dashboard_access) ? user.dashboard_access : [];
    if (!access.length || access.includes(preferred.replace(".html", ""))) return preferred;

    const firstDashboard = access.find(x => x.endsWith("-dashboard") || x === "dashboard");
    return firstDashboard ? `${firstDashboard}.html` : "leads.html";
}

