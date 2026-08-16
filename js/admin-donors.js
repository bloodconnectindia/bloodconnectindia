document.addEventListener("DOMContentLoaded", async () => {
    const user = await BloodConnectAdminShell.init();
    if (!user) return;
    const byId = id => document.getElementById(id);
    const form = byId("donor-filter-form");
    const loading = byId("donor-loading");
    const errorState = byId("donor-error");
    const emptyState = byId("donor-empty");
    const content = byId("donor-content");
    const resultCount = byId("donor-result-count");
    const tableBody = byId("donor-table-body");
    const cardList = byId("donor-card-list");
    const previous = byId("donor-previous-page");
    const next = byId("donor-next-page");
    const pageSummary = byId("donor-page-summary");
    const dialog = byId("donor-detail-dialog");
    const detailContent = byId("donor-detail-content");
    const escape = BloodConnectAdminShell.escape;
    let page = 1;
    let searchTimer;
    const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const date = value => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value)) : "No fixture donation recorded";
    const dateTime = value => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    const badge = value => `<span class="badge badge-${slug(value)}">${escape(value)}</span>`;
    const filters = () => ({ search: byId("donor-search").value, bloodGroup: byId("donor-blood-filter").value, availability: byId("donor-availability-filter").value, status: byId("donor-status-filter").value, sort: byId("donor-sort").value, page });

    function render(items) {
        tableBody.innerHTML = items.map(item => `<tr><td><span class="donor-id">${escape(item.id)}</span><span class="cell-secondary">${escape(item.fullName)}</span></td><td><strong>${escape(item.bloodGroup)}</strong></td><td>${escape(item.mobile)}</td><td>${escape(item.location)}</td><td>${escape(date(item.lastDonation))}</td><td>${badge(item.availability)}</td><td>${badge(item.status)}</td><td>${escape(dateTime(item.registeredAt))}</td><td><button class="detail-button" type="button" data-donor-id="${escape(item.id)}" aria-label="View details for ${escape(item.fullName)}">View</button></td></tr>`).join("");
        cardList.innerHTML = items.map(item => `<article class="donor-card"><header><div><span class="donor-id">${escape(item.id)}</span><h3>${escape(item.fullName)}</h3></div>${badge(item.status)}</header><dl><div><dt>Blood group</dt><dd><strong>${escape(item.bloodGroup)}</strong></dd></div><div><dt>Availability</dt><dd>${badge(item.availability)}</dd></div><div><dt>Mobile</dt><dd>${escape(item.mobile)}</dd></div><div><dt>Location</dt><dd>${escape(item.location)}</dd></div><div><dt>Last donation</dt><dd>${escape(date(item.lastDonation))}</dd></div><div><dt>Registered</dt><dd>${escape(dateTime(item.registeredAt))}</dd></div></dl><button class="detail-button" type="button" data-donor-id="${escape(item.id)}">View donor details</button></article>`).join("");
    }

    async function loadDonors() {
        loading.hidden = false; errorState.hidden = true; emptyState.hidden = true; content.hidden = true;
        resultCount.textContent = "Loading fixture donors...";
        try {
            const response = await BloodConnectAdminFixtures.getDonors(filters());
            page = response.page; loading.hidden = true;
            resultCount.textContent = `${response.total} fixture donor${response.total === 1 ? "" : "s"} found`;
            if (!response.total) { emptyState.hidden = false; return; }
            render(response.items);
            pageSummary.textContent = `Page ${response.page} of ${response.totalPages}`;
            previous.disabled = response.page <= 1; next.disabled = response.page >= response.totalPages;
            content.hidden = false;
        } catch { loading.hidden = true; errorState.hidden = false; resultCount.textContent = "Fixture service unavailable"; }
    }

    async function openDetail(id) {
        detailContent.innerHTML = '<div class="state-panel" role="status">Loading fixture detail...</div>';
        dialog.showModal();
        try {
            const item = await BloodConnectAdminFixtures.getDonorById(id);
            if (!item) throw new Error("Missing fixture donor");
            const detail = (label, value) => `<dl class="detail-item"><dt>${label}</dt><dd>${value}</dd></dl>`;
            detailContent.innerHTML = `<p class="fixture-notice"><strong>Fixture-only detail:</strong> No control in this view writes to Supabase.</p><div class="detail-grid">${detail("Donor ID", escape(item.id))}${detail("Full name", escape(item.fullName))}${detail("Blood group", escape(item.bloodGroup))}${detail("Mobile", escape(item.mobile))}${detail("Email", escape(item.email))}${detail("Location", escape(item.location))}${detail("Last donation", escape(date(item.lastDonation)))}${detail("Donation history", `${escape(item.donations)} fixture donation${item.donations === 1 ? "" : "s"}`)}${detail("Availability", badge(item.availability))}${detail("Status", badge(item.status))}${detail("Registered", escape(dateTime(item.registeredAt)))}</div><section class="detail-section"><h3>Admin workflow preview</h3><div class="workflow-actions"><button class="button" type="button" disabled>Approve (mock only)</button><button class="button button-secondary" type="button" disabled>Activate/deactivate</button><button class="button button-secondary" type="button" disabled>Change availability</button><button class="button button-secondary" type="button" disabled>Edit donor</button><button class="button button-secondary" type="button" disabled>Delete donor</button></div><p class="disabled-note">These actions require future permission-checked server services, RLS, validation, and audit logging.</p></section><section class="detail-section"><h3>Fixture activity</h3><ol class="timeline">${item.timeline.map(([event, time, note]) => `<li><strong>${escape(event)}</strong><small>${escape(time)} - ${escape(note)}</small></li>`).join("")}</ol></section>`;
            byId("donor-detail-title").textContent = `${item.id} - ${item.fullName}`;
        } catch { detailContent.innerHTML = '<div class="state-panel state-error" role="alert">Fixture donor details could not be loaded.</div>'; }
    }

    form.addEventListener("submit", event => { event.preventDefault(); page = 1; loadDonors(); });
    form.querySelectorAll("select").forEach(control => control.addEventListener("change", () => { page = 1; loadDonors(); }));
    byId("donor-search").addEventListener("input", () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { page = 1; loadDonors(); }, 250); });
    const clearFilters = () => { form.reset(); page = 1; loadDonors(); byId("donor-search").focus(); };
    byId("clear-donor-filters").addEventListener("click", clearFilters); byId("empty-clear-donor-filters").addEventListener("click", clearFilters); byId("retry-donors").addEventListener("click", loadDonors);
    previous.addEventListener("click", () => { if (page > 1) { page -= 1; loadDonors(); } }); next.addEventListener("click", () => { page += 1; loadDonors(); });
    content.addEventListener("click", event => { const button = event.target.closest("[data-donor-id]"); if (button) openDetail(button.dataset.donorId); });
    byId("close-donor-detail").addEventListener("click", () => dialog.close()); dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    await loadDonors();
});
