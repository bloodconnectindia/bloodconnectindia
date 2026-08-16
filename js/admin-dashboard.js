document.addEventListener("DOMContentLoaded", async () => {
    const user = await BloodConnectAdminShell.init();
    if (!user) return;
    const state = document.getElementById("dashboard-state");
    try {
        const data = await BloodConnectAdminFixtures.getDashboard();
        document.getElementById("summary-grid").innerHTML = data.summaries.map(item => `<article class="summary-card"><p>${BloodConnectAdminShell.escape(item.label)}</p><strong>${item.value}</strong><span>${BloodConnectAdminShell.escape(item.note)}</span></article>`).join("");
        const recentRequests = await BloodConnectAdminFixtures.getBloodRequests({ page: 1 });
        document.getElementById("recent-requests").innerHTML = recentRequests.items.slice(0, 3).map(item => `<li><span><strong>${BloodConnectAdminShell.escape(item.patient)}</strong><small>${BloodConnectAdminShell.escape(item.hospital)} · ${BloodConnectAdminShell.escape(item.bloodGroup)}</small></span><span class="badge badge-${item.status.toLowerCase().replace(/\s+/g, "-")}">${BloodConnectAdminShell.escape(item.status)}</span></li>`).join("");
        document.getElementById("stock-overview").innerHTML = data.stock.map(([group, units, condition]) => `<li><strong>${group}</strong><span>${units} units</span><span class="badge badge-${condition}">${condition}</span></li>`).join("");
        document.getElementById("activity-list").innerHTML = data.activity.map(([label, time]) => `<li><span>${BloodConnectAdminShell.escape(label)}</span><small>${BloodConnectAdminShell.escape(time)}</small></li>`).join("");
        state.hidden = true;
    } catch { state.className = "state-panel state-error"; state.textContent = "Fixture data could not be loaded. Refresh this page to try again."; }
});
