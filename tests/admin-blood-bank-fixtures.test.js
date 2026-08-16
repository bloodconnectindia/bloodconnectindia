globalThis.window = globalThis;
await import("../js/admin-fixtures.js");
const service = globalThis.BloodConnectAdminFixtures;

Deno.test("blood-bank fixtures paginate, filter, and sort", async () => {
    const all = await service.getBloodBanks({});
    if (all.total !== 10 || all.items.length !== 5 || all.totalPages !== 2) throw new Error("Unexpected bank pagination");
    const pending = await service.getBloodBanks({ status: "Pending", sort: "name" });
    if (pending.total !== 2 || pending.items[0].name !== "Lake City Donation Centre") throw new Error("Status filtering failed");
    const pune = await service.getBloodBanks({ location: "Pune" });
    if (pune.total !== 1 || pune.items[0].name !== "LifeLine Bank") throw new Error("Location filtering failed");
    const search = await service.getBloodBanks({ search: "dehradun" });
    if (search.total !== 1 || search.items[0].id !== "BB-2026-0005") throw new Error("Search failed");
});

Deno.test("blood-bank detail derives stock and request relationships", async () => {
    const redHope = await service.getBloodBankById("BB-2026-0014");
    if (!redHope || redHope.stockSummary.records !== 2 || redHope.stockSummary.availableUnits !== 37) throw new Error("Stock relationship failed");
    if (redHope.requestSummary.linked !== 1 || redHope.requestSummary.active !== 1) throw new Error("Request relationship failed");
    const pending = await service.getBloodBankById("BB-2026-0008");
    if (!pending || pending.stockSummary.records !== 0 || pending.stockSummary.bloodGroups.length !== 0) throw new Error("Empty relationship failed");
});

Deno.test("blood-bank fixture reads are isolated and unknown IDs fail closed", async () => {
    const bank = await service.getBloodBankById("BB-2026-0013");
    bank.name = "Changed locally";
    const again = await service.getBloodBankById("BB-2026-0013");
    if (again.name !== "LifeLine Bank") throw new Error("Fixture mutation leaked");
    if (await service.getBloodBankById("UNKNOWN")) throw new Error("Unknown bank should return null");
});
