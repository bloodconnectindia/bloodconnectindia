document.addEventListener("DOMContentLoaded", async () => {
    const user = await BloodConnectAdminShell.init();
    if (!user) return;
    const byId = id => document.getElementById(id);
    const form = byId("stock-filter-form");
    const loading = byId("stock-loading");
    const errorState = byId("stock-error");
    const emptyState = byId("stock-empty");
    const content = byId("stock-content");
    const resultCount = byId("stock-result-count");
    const tableBody = byId("stock-table-body");
    const cardList = byId("stock-card-list");
    const dialog = byId("stock-detail-dialog");
    const detailContent = byId("stock-detail-content");
    const escape = BloodConnectAdminShell.escape;
    let searchTimer;
    const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const badge = value => `<span class="badge badge-${slug(value)}">${escape(value)}</span>`;
    const dateTime = value => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    const filters = () => ({ search: byId("stock-search").value, bloodGroup: byId("stock-blood-filter").value, status: byId("stock-status-filter").value, bloodBank: byId("stock-bank-filter").value, sort: byId("stock-sort").value });

    function renderSummary(summary) {
        byId("summary-available").textContent = summary.availableUnits;
        byId("summary-low").textContent = summary.lowGroups;
        byId("summary-critical").textContent = summary.criticalGroups;
        byId("summary-banks").textContent = summary.bloodBanks;
        byId("summary-recent").textContent = summary.recentlyUpdated;
    }
    function populateBanks(banks) {
        const select = byId("stock-bank-filter");
        if (select.options.length > 1) return;
        banks.forEach(bank => select.add(new Option(bank, bank)));
    }
    function render(items) {
        tableBody.innerHTML = items.map(item => `<tr><td><span class="blood-group">${escape(item.bloodGroup)}</span></td><td><span class="unit-count">${escape(item.availableUnits)}</span> units</td><td>${escape(item.reservedUnits)} units</td><td>${badge(item.status)}</td><td>${escape(item.bloodBank)}</td><td>${escape(item.location)}</td><td>${escape(dateTime(item.updatedAt))}</td><td><button class="detail-button" type="button" data-stock-id="${escape(item.id)}" aria-label="View ${escape(item.bloodGroup)} stock at ${escape(item.bloodBank)}">View</button></td></tr>`).join("");
        cardList.innerHTML = items.map(item => `<article class="stock-card"><header><div><span class="blood-group">${escape(item.bloodGroup)}</span><h3>${escape(item.bloodBank)}</h3></div>${badge(item.status)}</header><dl><div><dt>Available</dt><dd><strong>${escape(item.availableUnits)} units</strong></dd></div><div><dt>Reserved</dt><dd>${escape(item.reservedUnits)} units</dd></div><div><dt>Location</dt><dd>${escape(item.location)}</dd></div><div><dt>Updated</dt><dd>${escape(dateTime(item.updatedAt))}</dd></div></dl><button class="detail-button" type="button" data-stock-id="${escape(item.id)}">View stock details</button></article>`).join("");
    }
    async function loadStock() {
        loading.hidden = false; errorState.hidden = true; emptyState.hidden = true; content.hidden = true;
        resultCount.textContent = "Loading fixture stock...";
        try {
            const response = await BloodConnectAdminFixtures.getBloodStock(filters());
            loading.hidden = true; renderSummary(response.summary); populateBanks(response.bloodBanks);
            resultCount.textContent = `${response.total} fixture stock record${response.total === 1 ? "" : "s"} found`;
            if (!response.total) { emptyState.hidden = false; return; }
            render(response.items); content.hidden = false;
        } catch { loading.hidden = true; errorState.hidden = false; resultCount.textContent = "Fixture service unavailable"; }
    }
    async function openDetail(id) {
        detailContent.innerHTML = '<div class="state-panel" role="status">Loading fixture detail...</div>';
        dialog.showModal();
        try {
            const item = await BloodConnectAdminFixtures.getBloodStockById(id);
            if (!item) throw new Error("Missing fixture stock");
            const thresholds = BloodConnectAdminFixtures.getStockStatusThresholds();
            const detail = (label, value) => `<dl class="detail-item"><dt>${label}</dt><dd>${value}</dd></dl>`;
            detailContent.innerHTML = `<p class="fixture-notice"><strong>Fixture-only detail:</strong> No control in this view writes to Supabase.</p><div class="detail-grid">${detail("Blood group", escape(item.bloodGroup))}${detail("Available units", escape(item.availableUnits))}${detail("Reserved units", escape(item.reservedUnits))}${detail("Usable total", `${escape(item.usableTotal)} units`)}${detail("Stock status", badge(item.status))}${detail("Blood bank", escape(item.bloodBank))}${detail("Location", escape(item.location))}${detail("Last updated", escape(dateTime(item.updatedAt)))}</div><p class="threshold-note">Fixture UI thresholds: Critical at ${thresholds.criticalMaximum} units or fewer; Low at ${thresholds.lowMaximum} units or fewer; otherwise Adequate. Production thresholds require operational and clinical approval.</p><section class="detail-section"><h3>Stock workflow preview</h3><div class="workflow-actions"><button class="button" type="button" disabled>Add stock</button><button class="button button-secondary" type="button" disabled>Reduce stock</button><button class="button button-secondary" type="button" disabled>Reserve units</button><button class="button button-secondary" type="button" disabled>Release reservation</button><button class="button button-secondary" type="button" disabled>Correct stock</button><button class="button button-secondary" type="button" disabled>Record adjustment</button></div><p class="disabled-note">Future permission-checked transactional services, concurrency controls, and audit logging are required.</p></section><section class="detail-section"><h3>Fixture adjustment activity</h3><ol class="timeline">${item.activity.map(([event, amount, time]) => `<li><strong>${escape(event)}</strong><small>${escape(amount)} - ${escape(time)}</small></li>`).join("")}</ol></section>`;
            byId("stock-detail-title").textContent = `${item.bloodGroup} - ${item.bloodBank}`;
        } catch { detailContent.innerHTML = '<div class="state-panel state-error" role="alert">Fixture stock details could not be loaded.</div>'; }
    }
    form.addEventListener("submit", event => { event.preventDefault(); loadStock(); });
    form.querySelectorAll("select").forEach(control => control.addEventListener("change", loadStock));
    byId("stock-search").addEventListener("input", () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(loadStock, 250); });
    const clearFilters = () => { form.reset(); loadStock(); byId("stock-search").focus(); };
    byId("clear-stock-filters").addEventListener("click", clearFilters); byId("empty-clear-stock-filters").addEventListener("click", clearFilters); byId("retry-stock").addEventListener("click", loadStock);
    content.addEventListener("click", event => { const button = event.target.closest("[data-stock-id]"); if (button) openDetail(button.dataset.stockId); });
    byId("close-stock-detail").addEventListener("click", () => dialog.close()); dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    await loadStock();
});
