document.addEventListener("DOMContentLoaded", async () => {
    const sessionUser = await BloodConnectAdminShell.init();
    if (!sessionUser) return;
    const byId = id => document.getElementById(id);
    const form = byId("user-filter-form");
    const loading = byId("user-loading");
    const errorState = byId("user-error");
    const emptyState = byId("user-empty");
    const content = byId("user-content");
    const resultCount = byId("user-result-count");
    const tableBody = byId("user-table-body");
    const cardList = byId("user-card-list");
    const previous = byId("user-previous-page");
    const next = byId("user-next-page");
    const pageSummary = byId("user-page-summary");
    const dialog = byId("user-detail-dialog");
    const detailContent = byId("user-detail-content");
    const escape = BloodConnectAdminShell.escape;
    let page = 1;
    let searchTimer;
    const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const badge = value => `<span class="badge badge-${slug(value)}">${escape(value)}</span>`;
    const dateTime = value => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never";
    const filters = () => ({ search: byId("user-search").value, role: byId("user-role-filter").value, status: byId("user-status-filter").value, sort: byId("user-sort").value, page });
    function render(items) {
        tableBody.innerHTML = items.map(item => `<tr><td><span class="user-id">${escape(item.id)}</span><span class="cell-secondary">${escape(item.fullName)}${item.isCurrentActor ? " (current Admin fixture)" : ""}</span></td><td>${escape(item.mobile)}<span class="cell-secondary">${escape(item.email)}</span></td><td>${badge(item.role)}</td><td>${badge(item.status)}</td><td>${escape(dateTime(item.createdAt))}</td><td>${escape(dateTime(item.lastLoginAt))}</td><td>${escape(dateTime(item.updatedAt))}</td><td><button class="detail-button" type="button" data-user-id="${escape(item.id)}" aria-label="View details for ${escape(item.fullName)}">View</button></td></tr>`).join("");
        cardList.innerHTML = items.map(item => `<article class="user-card"><header><div><span class="user-id">${escape(item.id)}</span><h3>${escape(item.fullName)}</h3></div>${badge(item.status)}</header><dl><div><dt>Role</dt><dd>${badge(item.role)}</dd></div><div><dt>Mobile</dt><dd>${escape(item.mobile)}</dd></div><div><dt>Last login</dt><dd>${escape(dateTime(item.lastLoginAt))}</dd></div><div><dt>Updated</dt><dd>${escape(dateTime(item.updatedAt))}</dd></div></dl><button class="detail-button" type="button" data-user-id="${escape(item.id)}">View user details</button></article>`).join("");
    }
    async function loadUsers() {
        loading.hidden = false; errorState.hidden = true; emptyState.hidden = true; content.hidden = true; resultCount.textContent = "Loading fixture users...";
        try { const response = await BloodConnectAdminFixtures.getUsers(filters()); page = response.page; loading.hidden = true; resultCount.textContent = `${response.total} fixture user${response.total === 1 ? "" : "s"} found`; if (!response.total) { emptyState.hidden = false; return; } render(response.items); pageSummary.textContent = `Page ${response.page} of ${response.totalPages}`; previous.disabled = response.page <= 1; next.disabled = response.page >= response.totalPages; content.hidden = false; }
        catch { loading.hidden = true; errorState.hidden = false; resultCount.textContent = "Fixture service unavailable"; }
    }
    async function openDetail(id) {
        detailContent.innerHTML = '<div class="state-panel" role="status">Loading fixture detail...</div>'; dialog.showModal();
        try {
            const item = await BloodConnectAdminFixtures.getUserById(id); if (!item) throw new Error("Missing fixture user");
            const detail = (label, value) => `<dl class="detail-item"><dt>${label}</dt><dd>${value}</dd></dl>`;
            const permissionChips = (items, denied = false) => items.length ? items.map(permission => `<span class="permission-chip${denied ? " permission-denied" : ""}">${denied ? "Denied: " : "Allowed: "}${escape(permission)}</span>`).join("") : '<span class="cell-secondary">None in fixture summary</span>';
            const selfWarning = item.isCurrentActor ? '<p class="self-warning"><strong>Current Admin protection:</strong> Self-deactivation and all self-role changes are unavailable. Admin cannot promote itself, assign Super Admin, or bypass explicit permission denies.</p>' : "";
            detailContent.innerHTML = `<p class="fixture-notice"><strong>Read-only fixture detail:</strong> No control in this view changes accounts, roles, status, or permissions.</p>${selfWarning}<div class="detail-grid">${detail("User ID", escape(item.id))}${detail("Auth identity reference", escape(item.authUserId))}${detail("Full name", escape(item.fullName))}${detail("Mobile", escape(item.mobile))}${detail("Email", escape(item.email))}${detail("Role", badge(item.role))}${detail("Status", badge(item.status))}${detail("Created", escape(dateTime(item.createdAt)))}${detail("Last login", escape(dateTime(item.lastLoginAt)))}${detail("Last updated", escape(dateTime(item.updatedAt)))}</div><section class="detail-section"><h3>Fixture permission summary</h3><p class="disabled-note">Permissions are evaluated separately from role. Explicit denies take precedence over role or system grants.</p><div class="permission-list">${permissionChips(item.permissions.effective)}${permissionChips(item.permissions.denied, true)}</div></section><section class="detail-section"><h3>User workflow preview</h3><div class="workflow-actions"><button class="button button-secondary" type="button" disabled>Activate/deactivate</button><button class="button button-secondary" type="button" disabled>Edit permitted profile</button><button class="button button-secondary" type="button" disabled>Assign operational role</button><button class="button button-secondary" type="button" disabled>Review permissions</button><button class="button button-secondary" type="button" disabled>Assist account access</button></div><p class="disabled-note">Every sensitive operation requires a separately approved, permission-checked, audited server service. Super Admin and authorization-management controls are intentionally absent.</p></section><section class="detail-section"><h3>Fixture activity</h3><ol class="timeline">${item.activity.map(([event, time, note]) => `<li><strong>${escape(event)}</strong><small>${escape(time)} - ${escape(note)}</small></li>`).join("")}</ol></section>`;
            byId("user-detail-title").textContent = `${item.id} - ${item.fullName}`;
        } catch { detailContent.innerHTML = '<div class="state-panel state-error" role="alert">Fixture user details could not be loaded.</div>'; }
    }
    form.addEventListener("submit", event => { event.preventDefault(); page = 1; loadUsers(); }); form.querySelectorAll("select").forEach(control => control.addEventListener("change", () => { page = 1; loadUsers(); }));
    byId("user-search").addEventListener("input", () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { page = 1; loadUsers(); }, 250); });
    const clearFilters = () => { form.reset(); page = 1; loadUsers(); byId("user-search").focus(); }; byId("clear-user-filters").addEventListener("click", clearFilters); byId("empty-clear-user-filters").addEventListener("click", clearFilters); byId("retry-users").addEventListener("click", loadUsers);
    previous.addEventListener("click", () => { if (page > 1) { page -= 1; loadUsers(); } }); next.addEventListener("click", () => { page += 1; loadUsers(); }); content.addEventListener("click", event => { const button = event.target.closest("[data-user-id]"); if (button) openDetail(button.dataset.userId); }); byId("close-user-detail").addEventListener("click", () => dialog.close()); dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    await loadUsers();
});
