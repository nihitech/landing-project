const CRM_MENU = [
  {
    title: "Dashboard",
    icon: "🏠",
    key: "dashboard",
    children: [
      { title: "Overview", url: "dashboard.html", key: "dashboard" }
    ]
  },
  {
    title: "Lead Management",
    icon: "👥",
    key: "leads",
    children: [
      {
        title: "Leads",
        children: [
          { title: "All Leads", url: "leads.html", key: "leads" },
          { title: "Follow-ups", url: "followups.html", key: "followups" }
        ]
      },
      {
        title: "Customer Pipeline",
        children: [
          { title: "Referrals", url: "referrals.html", key: "referrals" },
          { title: "Field Activity", url: "field-activity.html", key: "field-activity" }
        ]
      }
    ]
  },
  {
    title: "Vehicle & Stock",
    icon: "🚗",
    key: "vehicle",
    children: [
      {
        title: "Vehicle Master",
        children: [
          { title: "Models / Variants", url: "vehicles.html", key: "vehicles" }
        ]
      },
      {
        title: "Inventory",
        children: [
          { title: "Stock Summary", url: "stock.html", key: "stock" },
          { title: "VIN Inventory", url: "inventory.html", key: "inventory" }
        ]
      }
    ]
  },
  {
    title: "Booking & Delivery",
    icon: "📦",
    key: "booking",
    children: [
      {
        title: "Retail",
        children: [
          { title: "Bookings", url: "bookings.html", key: "bookings" }
        ]
      },
      {
        title: "Delivery",
        children: [
          { title: "Delivery / PDI", url: "delivery.html", key: "delivery" }
        ]
      }
    ]
  },
  {
    title: "Masters",
    icon: "⚙️",
    key: "masters",
    children: [
      {
        title: "Organization",
        children: [
          { title: "Branches", url: "branches.html", key: "branches" },
          { title: "Departments", url: "departments.html", key: "departments" }
        ]
      },
      {
        title: "Access Control",
        children: [
          { title: "Users", url: "users.html", key: "users" },
          { title: "Roles & Permissions", url: "roles.html", key: "roles" }
        ]
      }
    ]
  },
  {
    title: "Reports",
    icon: "📊",
    key: "reports",
    children: [
      {
        title: "Business Reports",
        children: [
          { title: "Analytics", url: "reports.html", key: "reports" },
          { title: "Activity Logs", url: "activity-logs.html", key: "activity-logs" }
        ]
      }
    ]
  }
];

function loadLayout(activeKey = "") {
  const sidebar = document.getElementById("sidebarContainer");
  if (!sidebar) return;

  sidebar.innerHTML = `
    <aside class="crm-sidebar">
      <div class="sidebar-brand">
        <div class="brand-logo">N</div>
        <div>
          <h2>Nihi Tech</h2>
          <span>Automobile CRM</span>
        </div>
      </div>

      <nav class="sidebar-tree">
        ${CRM_MENU.map(group => renderMenuGroup(group, activeKey)).join("")}
      </nav>
    </aside>
  `;
}

function renderMenuGroup(group, activeKey) {
  const isOpen = isGroupActive(group, activeKey);

  return `
    <div class="menu-group ${isOpen ? "open" : ""}">
      <button class="menu-main" type="button" onclick="toggleMenuGroup(this)">
        <span>${group.icon || "•"} ${group.title}</span>
        <b>⌄</b>
      </button>

      <div class="menu-children">
        ${(group.children || []).map(child => renderMenuNode(child, activeKey, 1)).join("")}
      </div>
    </div>
  `;
}

function renderMenuNode(node, activeKey, level = 1) {
  if (node.url) {
    const active = node.key === activeKey ? "active" : "";

    return `
      <a class="menu-link level-${level} ${active}" href="${node.url}">
        ${node.title}
      </a>
    `;
  }

  const isOpen = isGroupActive(node, activeKey);

  return `
    <div class="menu-node ${isOpen ? "open" : ""}">
      <button class="menu-sub" type="button" onclick="toggleMenuNode(this)">
        <span>${node.title}</span>
        <b>⌄</b>
      </button>

      <div class="menu-node-children">
        ${(node.children || []).map(child => renderMenuNode(child, activeKey, level + 1)).join("")}
      </div>
    </div>
  `;
}

function isGroupActive(node, activeKey) {
  if (!node) return false;
  if (node.key === activeKey) return true;

  return (node.children || []).some(child => isGroupActive(child, activeKey));
}

function toggleMenuGroup(btn) {
  const group = btn.closest(".menu-group");
  if (group) group.classList.toggle("open");
}

function toggleMenuNode(btn) {
  const node = btn.closest(".menu-node");
  if (node) node.classList.toggle("open");
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "login.html";
}