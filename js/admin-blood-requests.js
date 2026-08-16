document.addEventListener("DOMContentLoaded", async () => {
    const user = await BloodConnectAdminShell.init();
    if (!user) return;

    const form = document.getElementById("request-filter-form");
    const loading = document.getElementById("request-loading");
    const errorState = document.getElementById("request-error");
    const emptyState = document.getElementById("request-empty");
    const content = document.getElementById("request-content");
    const resultCount = document.getElementById("request-result-count");
    const tableBody = document.getElementById("request-table-body");
    const cardList = document.getElementById("request-card-list");
    const previous = document.getElementById("previous-page");
    const next = document.getElementById("next-page");
    const pageSummary = document.getElementById("page-summary");
    const dialog = document.getElementById("request-detail-dialog");
    const detailContent = document.getElementById("request-detail-content");
    let page = 1;
    let searchTimer;

    const escape = BloodConnectAdminShell.escape;
    const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const formatDate = value => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    const filters = () => ({ search: document.getElementById("request-search").value, bloodGroup: document.getElementById("blood-group-filter").value, status: document.getElementById("status-filter").value, dateRange: document.getElementById("date-filter").value, sort: document.getElementById("sort-filter").value, page });
    const statusBadge = status => `<span class="badge badge-${slug(status)}">${escape(status)}</span>`;

    const renderRows = items => {
        tableBody.innerHTML = items.map(item => `<tr><td><span class="request-id">${escape(item.id)}</span><span class="cell-secondary">${escape(item.fulfillment)}</span></td><td>${escape(item.patient)}<span class="cell-secondary">${escape(item.mobile)}</span></td><td><strong>${escape(item.bloodGroup)}</strong></td><td>${escape(item.hospital)}<span class="cell-secondary">${escape(item.hospitalAddress)}</span></td><td>${escape(formatDate(item.createdAt))}</td><td>${statusBadge(item.status)}</td><td><span class="priority-${slug(item.priority)}">${escape(item.priority)}</span></td><td>${escape(item.assignment)}</td><td><button class="detail-button" type="button" data-request-id="${escape(item.id)}" aria-label="View details for request ${escape(item.id)}">View</button></td></tr>`).join("");
        cardList.innerHTML = items.map(item => `<article class="request-card"><header><div><span class="request-id">${escape(item.id)}</span><h3>${escape(item.patient)}</h3></div>${statusBadge(item.status)}</header><dl><div><dt>Blood group</dt><dd><strong>${escape(item.bloodGroup)}</strong></dd></div><div><dt>Priority</dt><dd class="priority-${slug(item.priority)}">${escape(item.priority)}</dd></div><div><dt>Hospital</dt><dd>${escape(item.hospital)}</dd></div><div><dt>Assignment</dt><dd>${escape(item.assignment)}</dd></div><div><dt>Created</dt><dd>${escape(formatDate(item.createdAt))}</dd></div><div><dt>Fulfillment</dt><dd>${escape(item.fulfillment)}</dd></div></dl><button class="detail-button" type="button" data-request-id="${escape(item.id)}">View request details</button></article>`).join("");
    };

    async function loadRequests() {
        loading.hidden = false;
        errorState.hidden = true;
        emptyState.hidden = true;
        content.hidden = true;
        resultCount.textContent = "Loading fixture requests…";
        try {
            const response = await BloodConnectAdminFixtures.getBloodRequests(filters());
            page = response.page;
            loading.hidden = true;
            resultCount.textContent = `${response.total} fixture request${response.total === 1 ? "" : "s"} found`;
            if (!response.total) {
                emptyState.hidden = false;
                return;
            }
            renderRows(response.items);
            pageSummary.textContent = `Page ${response.page} of ${response.totalPages}`;
            previous.disabled = response.page <= 1;
            next.disabled = response.page >= response.totalPages;
            content.hidden = false;
        } catch {
            loading.hidden = true;
            errorState.hidden = false;
            resultCount.textContent = "Fixture service unavailable";
        }
    }

    async function openDetail(id) {
        detailContent.innerHTML = '<div class="state-panel" role="status">Loading fixture detail…</div>';
        dialog.showModal();
        try {
            const item = await BloodConnectAdminFixtures.getBloodRequestById(id);
            if (!item) throw new Error("Missing fixture request");
            detailContent.innerHTML = `<p class="fixture-notice"><strong>Fixture-only detail:</strong> No controls in this view write to Supabase.</p><div class="detail-grid"><dl class="detail-item"><dt>Request ID</dt><dd>${escape(item.id)}</dd></dl><dl class="detail-item"><dt>Patient</dt><dd>${escape(item.patient)}</dd></dl><dl class="detail-item"><dt>Blood group</dt><dd>${escape(item.bloodGroup)}</dd></dl><dl class="detail-item"><dt>Priority</dt><dd class="priority-${slug(item.priority)}">${escape(item.priority)}</dd></dl><dl class="detail-item"><dt>Hospital</dt><dd>${escape(item.hospital)}</dd></dl><dl class="detail-item"><dt>Hospital address</dt><dd>${escape(item.hospitalAddress)}</dd></dl><dl class="detail-item"><dt>Contact</dt><dd>${escape(item.mobile)}</dd></dl><dl class="detail-item"><dt>Patient address</dt><dd>${escape(item.address)}</dd></dl><dl class="detail-item"><dt>Created</dt><dd>${escape(formatDate(item.createdAt))}</dd></dl><dl class="detail-item"><dt>Current status</dt><dd>${statusBadge(item.status)}</dd></dl><dl class="detail-item"><dt>Assignment</dt><dd>${escape(item.assignment)}</dd></dl><dl class="detail-item"><dt>Fulfillment</dt><dd>${escape(item.fulfillment)}</dd></dl></div><section class="detail-section"><h3>Status workflow preview</h3><div class="status-preview"><div><label for="status-preview-select">Proposed status</label><select id="status-preview-select" disabled><option>${escape(item.status)}</option><option>New</option><option>Under Review</option><option>Approved</option><option>Assigned</option><option>Fulfilled</option><option>Rejected</option><option>Cancelled</option></select></div><button class="button" type="button" disabled>Update status (mock only)</button></div><p class="disabled-note">Status, assignment, rejection, cancellation, and fulfillment require a future permission-checked server service.</p></section><section class="detail-section"><h3>Assignment preview</h3><p><strong>${escape(item.assignment)}</strong> · ${escape(item.fulfillment)}</p><button class="button button-secondary" type="button" disabled>Assign fulfillment partner (mock only)</button></section><section class="detail-section"><h3>Request activity</h3><ol class="timeline">${item.timeline.map(([event, time, note]) => `<li><strong>${escape(event)}</strong><small>${escape(time)} · ${escape(note)}</small></li>`).join("")}</ol></section>`;
            document.getElementById("request-detail-title").textContent = `${item.id} · ${item.patient}`;
        } catch {
            detailContent.innerHTML = '<div class="state-panel state-error" role="alert">Fixture request details could not be loaded.</div>';
        }
    }

    form.addEventListener("submit", event => { event.preventDefault(); page = 1; loadRequests(); });
    form.querySelectorAll("select").forEach(control => control.addEventListener("change", () => { page = 1; loadRequests(); }));
    document.getElementById("request-search").addEventListener("input", () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { page = 1; loadRequests(); }, 250); });
    const clearFilters = () => { form.reset(); page = 1; loadRequests(); document.getElementById("request-search").focus(); };
    document.getElementById("clear-request-filters").addEventListener("click", clearFilters);
    document.getElementById("empty-clear-filters").addEventListener("click", clearFilters);
    document.getElementById("retry-requests").addEventListener("click", loadRequests);
    previous.addEventListener("click", () => { if (page > 1) { page -= 1; loadRequests(); } });
    next.addEventListener("click", () => { page += 1; loadRequests(); });
    document.getElementById("request-content").addEventListener("click", event => { const button = event.target.closest("[data-request-id]"); if (button) openDetail(button.dataset.requestId); });
    document.getElementById("close-request-detail").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    await loadRequests();
});
