document.addEventListener("DOMContentLoaded", async () => {
    const user = await BloodConnectAdminShell.init();
    if (!user) return;
    const byId = id => document.getElementById(id);
    const form = byId("hospital-filter-form");
    const loading = byId("hospital-loading");
    const errorState = byId("hospital-error");
    const emptyState = byId("hospital-empty");
    const content = byId("hospital-content");
    const resultCount = byId("hospital-result-count");
    const tableBody = byId("hospital-table-body");
    const cardList = byId("hospital-card-list");
    const previous = byId("hospital-previous-page");
    const next = byId("hospital-next-page");
    const pageSummary = byId("hospital-page-summary");
    const dialog = byId("hospital-detail-dialog");
    const detailContent = byId("hospital-detail-content");
    const escape = BloodConnectAdminShell.escape;
    let page = 1;
    let searchTimer;
    const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const badge = value => `<span class="badge badge-${slug(value)}">${escape(value)}</span>`;
    const dateTime = value => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    const filters = () => ({ search: byId("hospital-search").value, status: byId("hospital-status-filter").value, location: byId("hospital-location-filter").value, sort: byId("hospital-sort").value, page });
    function populateLocations(locations) { const select = byId("hospital-location-filter"); if (select.options.length > 1) return; locations.forEach(location => select.add(new Option(location, location))); }
    function render(items) {
        tableBody.innerHTML = items.map(item => `<tr><td><span class="hospital-id">${escape(item.id)}</span><span class="cell-secondary">${escape(item.name)}</span></td><td>${escape(item.contact)}<span class="cell-secondary">${escape(item.email)}</span></td><td>${escape(item.city)}, ${escape(item.state)}<span class="cell-secondary">${escape(item.district)}</span></td><td>${badge(item.status)}</td><td>${escape(dateTime(item.registeredAt))}</td><td>${escape(dateTime(item.updatedAt))}</td><td><strong>${escape(item.requestSummary.total)} total</strong><span class="cell-secondary">${escape(item.requestSummary.active)} active, ${escape(item.requestSummary.fulfilled)} fulfilled</span></td><td><button class="detail-button" type="button" data-hospital-id="${escape(item.id)}" aria-label="View details for ${escape(item.name)}">View</button></td></tr>`).join("");
        cardList.innerHTML = items.map(item => `<article class="hospital-card"><header><div><span class="hospital-id">${escape(item.id)}</span><h3>${escape(item.name)}</h3></div>${badge(item.status)}</header><dl><div><dt>Contact</dt><dd>${escape(item.contact)}</dd></div><div><dt>Location</dt><dd>${escape(item.location)}</dd></div><div><dt>Linked requests</dt><dd>${escape(item.requestSummary.total)} total / ${escape(item.requestSummary.active)} active</dd></div><div><dt>Updated</dt><dd>${escape(dateTime(item.updatedAt))}</dd></div></dl><button class="detail-button" type="button" data-hospital-id="${escape(item.id)}">View hospital details</button></article>`).join("");
    }
    async function loadHospitals() {
        loading.hidden = false; errorState.hidden = true; emptyState.hidden = true; content.hidden = true; resultCount.textContent = "Loading fixture hospitals...";
        try { const response = await BloodConnectAdminFixtures.getHospitals(filters()); page = response.page; loading.hidden = true; populateLocations(response.locations); resultCount.textContent = `${response.total} fixture hospital${response.total === 1 ? "" : "s"} found`; if (!response.total) { emptyState.hidden = false; return; } render(response.items); pageSummary.textContent = `Page ${response.page} of ${response.totalPages}`; previous.disabled = response.page <= 1; next.disabled = response.page >= response.totalPages; content.hidden = false; }
        catch { loading.hidden = true; errorState.hidden = false; resultCount.textContent = "Fixture service unavailable"; }
    }
    async function openDetail(id) {
        detailContent.innerHTML = '<div class="state-panel" role="status">Loading fixture detail...</div>'; dialog.showModal();
        try {
            const item = await BloodConnectAdminFixtures.getHospitalById(id); if (!item) throw new Error("Missing fixture hospital");
            const detail = (label, value) => `<dl class="detail-item"><dt>${label}</dt><dd>${value}</dd></dl>`;
            const recent = item.requestSummary.mostRecent ? `${escape(item.requestSummary.mostRecent.id)} - ${escape(item.requestSummary.mostRecent.bloodGroup)} - ${escape(item.requestSummary.mostRecent.status)} - ${escape(dateTime(item.requestSummary.mostRecent.createdAt))}` : "No linked fixture request";
            const statuses = Object.entries(item.requestSummary.statuses).map(([status, count]) => `<span class="status-count">${escape(status)}: ${escape(count)}</span>`).join("") || '<span class="cell-secondary">No fixture statuses</span>';
            detailContent.innerHTML = `<p class="fixture-notice"><strong>Fixture-only detail:</strong> No control in this view writes to Supabase.</p><div class="detail-grid">${detail("Hospital ID", escape(item.id))}${detail("Name", escape(item.name))}${detail("Contact", escape(item.contact))}${detail("Email", escape(item.email))}${detail("Address", escape(item.address))}${detail("City / district", `${escape(item.city)} / ${escape(item.district)}`)}${detail("State", escape(item.state))}${detail("Status", badge(item.status))}${detail("Registered", escape(dateTime(item.registeredAt)))}${detail("Last updated", escape(dateTime(item.updatedAt)))}</div><section class="detail-section"><h3>Linked request summary</h3><div class="detail-grid">${detail("Total requests", escape(item.requestSummary.total))}${detail("Active requests", escape(item.requestSummary.active))}${detail("Fulfilled requests", escape(item.requestSummary.fulfilled))}${detail("Most recent request", recent)}</div><div class="status-list" aria-label="Fixture request counts by status">${statuses}</div></section><section class="detail-section"><h3>Admin workflow preview</h3><div class="workflow-actions"><button class="button" type="button" disabled>Approve</button><button class="button button-secondary" type="button" disabled>Activate/deactivate</button><button class="button button-secondary" type="button" disabled>Edit details</button><button class="button button-secondary" type="button" disabled>View linked requests</button><button class="button button-secondary" type="button" disabled>Assign/manage requests</button><button class="button button-secondary" type="button" disabled>Delete/decommission</button></div><p class="disabled-note">Future permission-checked server services, stable relationships, and audit logging are required.</p></section><section class="detail-section"><h3>Fixture activity</h3><ol class="timeline">${item.activity.map(([event, time, note]) => `<li><strong>${escape(event)}</strong><small>${escape(time)} - ${escape(note)}</small></li>`).join("")}</ol></section>`;
            byId("hospital-detail-title").textContent = `${item.id} - ${item.name}`;
        } catch { detailContent.innerHTML = '<div class="state-panel state-error" role="alert">Fixture hospital details could not be loaded.</div>'; }
    }
    form.addEventListener("submit", event => { event.preventDefault(); page = 1; loadHospitals(); }); form.querySelectorAll("select").forEach(control => control.addEventListener("change", () => { page = 1; loadHospitals(); }));
    byId("hospital-search").addEventListener("input", () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { page = 1; loadHospitals(); }, 250); });
    const clearFilters = () => { form.reset(); page = 1; loadHospitals(); byId("hospital-search").focus(); }; byId("clear-hospital-filters").addEventListener("click", clearFilters); byId("empty-clear-hospital-filters").addEventListener("click", clearFilters); byId("retry-hospitals").addEventListener("click", loadHospitals);
    previous.addEventListener("click", () => { if (page > 1) { page -= 1; loadHospitals(); } }); next.addEventListener("click", () => { page += 1; loadHospitals(); }); content.addEventListener("click", event => { const button = event.target.closest("[data-hospital-id]"); if (button) openDetail(button.dataset.hospitalId); }); byId("close-hospital-detail").addEventListener("click", () => dialog.close()); dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    await loadHospitals();
});
