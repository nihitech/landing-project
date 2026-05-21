function normalizeRoleValue(role){return String(role||"").trim().toLowerCase();}
function normalizeDepartmentValue(dept){return String(dept||"").trim().toLowerCase().replace(/\s+/g,"_");}
function getWorkspaceUrl(user){
 const role=normalizeRoleValue(user?.role);
 const dept=normalizeDepartmentValue(user?.department_name||user?.department||user?.department_code);
 if(["admin","super_admin","owner","director","ceo"].includes(role)) return "dashboard.html";
 if(["receptionist","front_desk"].includes(role)||dept.includes("reception")) return "receptionist-dashboard.html";
 if(["telecaller","crm_executive","customer_validator"].includes(role)||dept.includes("tele")||dept.includes("crm")) return "telecaller-dashboard.html";
 if(["manager","branch_manager","team_leader","sales_manager"].includes(role)) return "manager-dashboard.html";
 if(["field","field_executive","campaign_promoter"].includes(role)||dept.includes("field")) return "field-dashboard.html";
 if(["sales","sales_executive","sales_consultant"].includes(role)||dept.includes("sales")) return "sales-dashboard.html";
 if(dept.includes("delivery")||role.includes("delivery")) return "delivery-dashboard.html";
 if(dept.includes("finance")||dept.includes("insurance")||role.includes("finance")) return "finance-dashboard.html";
 if(dept.includes("service")||role.includes("service")) return "service-dashboard.html";
 if(dept.includes("marketing")||role.includes("marketing")) return "marketing-dashboard.html";
 return "sales-dashboard.html";
}
window.getWorkspaceUrl=getWorkspaceUrl;
