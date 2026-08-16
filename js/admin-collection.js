document.addEventListener("DOMContentLoaded", async () => {
    const user = await BloodConnectAdminShell.init();
    if (!user) return;
    const root = document.getElementById("collection-view");
    const key = root.dataset.collection;
    try {
        const data = await BloodConnectAdminFixtures.getCollection(key);
        document.getElementById("collection-description").textContent = data.description;
        const table = document.getElementById("collection-table");
        table.querySelector("thead").innerHTML = `<tr>${data.columns.map(column => `<th scope="col">${BloodConnectAdminShell.escape(column)}</th>`).join("")}</tr>`;
        table.querySelector("tbody").innerHTML = data.rows.map(row => `<tr>${row.map(cell => `<td>${BloodConnectAdminShell.escape(cell)}</td>`).join("")}</tr>`).join("");
        document.getElementById("collection-loading").hidden = true;
        table.hidden = data.rows.length === 0;
        document.getElementById("collection-empty").hidden = data.rows.length !== 0;
    } catch { const state = document.getElementById("collection-loading"); state.className = "state-panel state-error"; state.textContent = "Fixture data could not be loaded."; }
});
