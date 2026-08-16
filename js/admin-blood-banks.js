document.addEventListener("DOMContentLoaded", async () => {
    const user = await BloodConnectAdminShell.init();
    if (!user) return;
    const byId = id => document.getElementById(id);
    const form = byId("bank-filter-form");
    const loading = byId("bank-loading");
    const errorState = byId("bank-error");
    const emptyState = byId("bank-empty");
    const content = byId("bank-content");
    const resultCount = byId("bank-result-count");
    const tableBody = byId("bank-table-body");
    const cardList = byId("bank-card-list");
    const previous = byId("bank-previous-page");
    const next = byId("bank-next-page");
    const pageSummary = byId("bank-page-summary");
    const dialog = byId("bank-detail-dialog");
    const detailContent = byId("bank-detail-content");
    const escape = BloodConnectAdminShell.escape;
    let page = 1;
    let searchTimer;
    const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const badge = value => `<span class="badge badge-${slug(value)}">${escape(value)}</span>`;
    const dateTime = value => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    const groupList = groups => groups.length ? `<span class="group-list">${groups.map(group => `<span class="group-chip">${escape(group)}</span>`).join("")}</span>` : '<span class="cell-secondary">No linked fixture stock</span>';
    const filters = () => ({ search: byId("bank-search").value, status: byId("bank-status-filter").value, location: byId("bank-location-filter").value, sort: byId("bank-sort").value, page });

    function populateLocations(locations) {
        const select = byId("bank-location-filter");
        if (select.options.length > 1) return;
        locations.forEach(location => select.add(new Option(location, location)));
    }
    function render(items) {
        tableBody.innerHTML = items.map(item => `<tr><td><span class="bank-id">${escape(item.id)}</span><span class="cell-secondary">${escape(item.name)}</span></td><td>${escape(item.contact)}<span class="cell-secondary">${escape(item.email)}</span></td><td>${escape(item.city)}, ${escape(item.state)}<span class="cell-secondary">${escape(item.district)}</span></td><td>${badge(item.status)}</td><td>${escape(dateTime(item.registeredAt))}</td><td>${escape(dateTime(item.updatedAt))}</td><td>${groupList(item.stockSummary.bloodGroups)}</td><td><button class="detail-button" type="button" data-bank-id="${escape(item.id)}" aria-label="View details for ${escape(item.name)}">View</button></td></tr>`).join("");
        cardList.innerHTML = items.map(item => `<article class="bank-card"><header><div><span class="bank-id">${escape(item.id)}</span><h3>${escape(item.name)}</h3></div>${badge(item.status)}</header><dl><div><dt>Contact</dt><dd>${escape(item.contact)}</dd></div><div><dt>Location</dt><dd>${escape(item.location)}</dd></div><div><dt>Available stock</dt><dd>${escape(item.stockSummary.availableUnits)} fixture units</dd></div><div><dt>Registered</dt><dd>${escape(dateTime(item.registeredAt))}</dd></div></dl>${groupList(item.stockSummary.bloodGroups)}<button class="detail-button" type="button" data-bank-id="${escape(item.id)}">View blood bank details</button></article>`).join("");
    }
    async function loadBanks() {
        loading.hidden = false; errorState.hidden = true; emptyState.hidden = true; content.hidden = true;
        resultCount.textContent = "Loading fixture blood banks...";
        try {
            const response = await BloodConnectAdminFixtures.getBloodBanks(filters());
            page = response.page; loading.hidden = true; populateLocations(response.locations);
            resultCount.textContent = `${response.total} fixture blood bank${response.total === 1 ? "" : "s"} found`;
            if (!response.total) { emptyState.hidden = false; return; }
            render(response.items); pageSummary.textContent = `Page ${response.page} of ${response.totalPages}`;
            previous.disabled = response.page <= 1; next.disabled = response.page >= response.totalPages; content.hidden = false;
        } catch { loading.hidden = true; errorState.hidden = false; resultCount.textContent = "Fixture service unavailable"; }
    }
    async function openDetail(id) {
        detailContent.innerHTML = '<div class="state-panel" role="status">Loading fixture detail...</div>';
        dialog.showModal();
        try {
            const item = await BloodConnectAdminFixtures.getBloodBankById(id);
            if (!item) throw new Error("Missing fixture bank");
            const detail = (label, value) => `<dl class="detail-item"><dt>${label}</dt><dd>${value}</dd></dl>`;
            detailContent.innerHTML = `<p class="fixture-notice"><strong>Fixture-only detail:</strong> No control in this view writes to Supabase.</p><div class="detail-grid">${detail("Blood bank ID", escape(item.id))}${detail("Name", escape(item.name))}${detail("Contact", escape(item.contact))}${detail("Email", escape(item.email))}${detail("Address", escape(item.address))}${detail("City / district", `${escape(item.city)} / ${escape(item.district)}`)}${detail("State", escape(item.state))}${detail("Status", badge(item.status))}${detail("Registered", escape(dateTime(item.registeredAt)))}${detail("Last updated", escape(dateTime(item.updatedAt)))}</div><section class="detail-section"><h3>Linked operational summary</h3><div class="detail-grid">${detail("Fixture stock records", escape(item.stockSummary.records))}${detail("Available / reserved", `${escape(item.stockSummary.availableUnits)} / ${escape(item.stockSummary.reservedUnits)} units`)}${detail("Available blood groups", groupList(item.stockSummary.bloodGroups))}${detail("Linked / active requests", `${escape(item.requestSummary.linked)} / ${escape(item.requestSummary.active)}`)}</div></section><section class="detail-section"><h3>Admin workflow preview</h3><div class="workflow-actions"><button class="button" type="button" disabled>Approve</button><button class="button button-secondary" type="button" disabled>Activate/deactivate</button><button class="button button-secondary" type="button" disabled>Edit details</button><button class="button button-secondary" type="button" disabled>View/manage stock</button><button class="button button-secondary" type="button" disabled>View requests</button><button class="button button-secondary" type="button" disabled>Delete/decommission</button></div><p class="disabled-note">Future permission-checked server services, relationship validation, and audit logging are required.</p></section><section class="detail-section"><h3>Fixture activity</h3><ol class="timeline">${item.activity.map(([event, time, note]) => `<li><strong>${escape(event)}</strong><small>${escape(time)} - ${escape(note)}</small></li>`).join("")}</ol></section>`;
            byId("bank-detail-title").textContent = `${item.id} - ${item.name}`;
        } catch { detailContent.innerHTML = '<div class="state-panel state-error" role="alert">Fixture blood bank details could not be loaded.</div>'; }
    }
    form.addEventListener("submit", event => { event.preventDefault(); page = 1; loadBanks(); });
    form.querySelectorAll("select").forEach(control => control.addEventListener("change", () => { page = 1; loadBanks(); }));
    byId("bank-search").addEventListener("input", () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { page = 1; loadBanks(); }, 250); });
    const clearFilters = () => { form.reset(); page = 1; loadBanks(); byId("bank-search").focus(); };
    byId("clear-bank-filters").addEventListener("click", clearFilters); byId("empty-clear-bank-filters").addEventListener("click", clearFilters); byId("retry-banks").addEventListener("click", loadBanks);
    previous.addEventListener("click", () => { if (page > 1) { page -= 1; loadBanks(); } }); next.addEventListener("click", () => { page += 1; loadBanks(); });
    content.addEventListener("click", event => { const button = event.target.closest("[data-bank-id]"); if (button) openDetail(button.dataset.bankId); });
    byId("close-bank-detail").addEventListener("click", () => dialog.close()); dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    await loadBanks();
});
