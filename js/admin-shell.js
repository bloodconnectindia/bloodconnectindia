window.BloodConnectAdminShell = (() => {
    const links = [["dashboard", "Dashboard", "admin-dashboard.html"], ["requests", "Blood Requests", "admin-blood-requests.html"], ["donors", "Donors", "admin-donors.html"], ["stock", "Blood Stock", "admin-blood-stock.html"], ["banks", "Blood Banks", "admin-blood-banks.html"], ["hospitals", "Hospitals", "admin-hospitals.html"], ["users", "Users", "admin-users.html"], ["demo", "Demo Management", "admin-demo-management.html"]];
    const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    async function init() {
        const root = document.querySelector("[data-admin-shell]");
        if (!root) return null;
        const section = root.dataset.section;
        const title = root.dataset.title || "Admin";
        const content = root.innerHTML;
        root.innerHTML = `<a class="skip-link" href="#admin-main">Skip to content</a><aside class="admin-sidebar" id="admin-sidebar"><a class="admin-brand" href="admin-dashboard.html"><span class="brand-mark" aria-hidden="true">BC</span><span>BloodConnectIndia<small>Admin workspace</small></span></a><nav aria-label="Admin navigation">${links.map(([key, label, href]) => `<a href="${href}" ${key === section ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</nav><button class="admin-logout" id="admin-logout" type="button">Logout</button></aside><div class="admin-workspace"><header class="admin-topbar"><button class="nav-toggle" id="admin-nav-toggle" type="button" aria-controls="admin-sidebar" aria-expanded="false"><span aria-hidden="true">&#9776;</span><span class="sr-only">Toggle navigation</span></button><div><p class="eyebrow">Admin workspace</p><h1>${escape(title)}</h1></div><span class="mock-pill">Fixture data</span></header><main class="admin-main" id="admin-main">${content}</main></div><button class="nav-scrim" id="admin-nav-scrim" type="button" aria-label="Close navigation"></button>`;
        const toggle = document.getElementById("admin-nav-toggle");
        const closeNav = () => { document.body.classList.remove("nav-open"); toggle.setAttribute("aria-expanded", "false"); };
        toggle.addEventListener("click", () => { const open = document.body.classList.toggle("nav-open"); toggle.setAttribute("aria-expanded", String(open)); });
        document.getElementById("admin-nav-scrim").addEventListener("click", closeNav);
        root.querySelectorAll(".admin-sidebar a").forEach(link => link.addEventListener("click", closeNav));
        document.getElementById("admin-logout").addEventListener("click", async () => { try { await BloodConnectAuth.signOut(); } finally { window.location.href = "admin-login.html"; } });
        try { return await BloodConnectAuth.requireAuthenticatedSession(); } catch { window.location.replace("admin-login.html"); return null; }
    }
    return { init, escape };
})();
