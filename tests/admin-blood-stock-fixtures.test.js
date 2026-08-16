globalThis.window = globalThis;
await import("../js/admin-fixtures.js");
const service = globalThis.BloodConnectAdminFixtures;

Deno.test("stock fixtures return summary and server-boundary-derived statuses", async () => {
    const result = await service.getBloodStock({});
    if (result.total !== 12 || result.summary.availableUnits !== 175 || result.summary.bloodBanks !== 6) throw new Error("Unexpected stock summary");
    if (result.summary.lowGroups !== 3 || result.summary.criticalGroups !== 3) throw new Error("Unexpected status counts");
    if (result.thresholds.criticalMaximum !== 6 || result.thresholds.lowMaximum !== 12) throw new Error("Unexpected thresholds");
});

Deno.test("stock fixtures filter and sort without mutating source data", async () => {
    const critical = await service.getBloodStock({ status: "Critical", sort: "units-low" });
    if (critical.total !== 3 || critical.items[0].availableUnits !== 4) throw new Error("Critical filtering or sorting failed");
    const bank = await service.getBloodStock({ bloodBank: "LifeLine Bank", bloodGroup: "B-" });
    if (bank.total !== 1 || bank.items[0].id !== "STK-LLB-B-NEG") throw new Error("Bank/group filtering failed");
    const search = await service.getBloodStock({ search: "chennai" });
    if (search.total !== 2) throw new Error("Location search failed");
});

Deno.test("stock fixture detail includes usable total and activity", async () => {
    const item = await service.getBloodStockById("STK-RHC-O-NEG");
    if (!item || item.status !== "Critical" || item.usableTotal !== 7 || !item.activity.length) throw new Error("Stock detail failed");
    if (await service.getBloodStockById("UNKNOWN")) throw new Error("Unknown stock record should return null");
});
