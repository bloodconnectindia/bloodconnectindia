globalThis.window = globalThis;
await import("../js/admin-fixtures.js");
const service = globalThis.BloodConnectAdminFixtures;

Deno.test("user fixtures paginate, filter, search, and sort", async () => {
    const all = await service.getUsers({});
    if (all.total !== 10 || all.items.length !== 5 || all.totalPages !== 2) throw new Error("Unexpected user pagination");
    const admins = await service.getUsers({ role: "Admin", status: "Active", sort: "name" });
    if (admins.total !== 2 || admins.items[0].fullName !== "Operations Admin") throw new Error("Role/status filter failed");
    const pending = await service.getUsers({ status: "Pending" }); if (pending.total !== 2) throw new Error("Status filter failed");
    const search = await service.getUsers({ search: "red hope" }); if (search.total !== 1 || search.items[0].role !== "Blood Bank") throw new Error("Search failed");
});

Deno.test("user detail separates role, status, and permission decisions", async () => {
    const current = await service.getUserById("USR-2026-0231");
    if (!current || !current.isCurrentActor || current.role !== "Admin" || current.status !== "Active") throw new Error("Current Admin fixture failed");
    if (!current.permissions.denied.includes("super_admin.assign") || current.permissions.effective.includes("super_admin.assign")) throw new Error("Permission separation failed");
    if (current.role === "Super Admin") throw new Error("Current Admin was elevated");
});

Deno.test("user fixture reads are isolated and expose only the fixture contract", async () => {
    const user = await service.getUserById("USR-2026-0230"); user.role = "Super Admin";
    if ((await service.getUserById("USR-2026-0230")).role !== "Admin") throw new Error("Fixture mutation leaked");
    if (await service.getUserById("UNKNOWN")) throw new Error("Unknown user should return null");
    const keys = Object.keys(await service.getUserById("USR-2026-0230"));
    if (keys.some(key => /password|token|secret|credential/i.test(key))) throw new Error("Sensitive field exposed");
});
