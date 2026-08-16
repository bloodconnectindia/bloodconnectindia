globalThis.window = globalThis;
await import("../js/admin-fixtures.js");
const service = globalThis.BloodConnectAdminFixtures;

Deno.test("hospital fixtures paginate, filter, search, and sort", async () => {
    const all = await service.getHospitals({});
    if (all.total !== 10 || all.items.length !== 5 || all.totalPages !== 2) throw new Error("Unexpected hospital pagination");
    const active = await service.getHospitals({ status: "Active", sort: "name" });
    if (active.total !== 7 || active.items[0].name !== "City Care Hospital") throw new Error("Status filter failed");
    const pune = await service.getHospitals({ location: "Pune" });
    if (pune.total !== 2) throw new Error("Location filter failed");
    const search = await service.getHospitals({ search: "ernakulam" });
    if (search.total !== 1 || search.items[0].name !== "Harbor Medical") throw new Error("Search failed");
});

Deno.test("hospital detail derives request status and recency summaries", async () => {
    const cityCare = await service.getHospitalById("HSP-2026-0027");
    if (!cityCare || cityCare.requestSummary.total !== 1 || cityCare.requestSummary.active !== 1 || cityCare.requestSummary.fulfilled !== 0) throw new Error("Request counts failed");
    if (cityCare.requestSummary.mostRecent.id !== "BR-2026-1042" || cityCare.requestSummary.statuses.New !== 1) throw new Error("Request summary failed");
    const metro = await service.getHospitalById("HSP-2026-0023");
    if (metro.requestSummary.fulfilled !== 1 || metro.requestSummary.active !== 0) throw new Error("Fulfilled summary failed");
});

Deno.test("hospital fixture reads are isolated and unknown IDs fail closed", async () => {
    const hospital = await service.getHospitalById("HSP-2026-0026"); hospital.name = "Changed locally";
    if ((await service.getHospitalById("HSP-2026-0026")).name !== "Sunrise Medical") throw new Error("Fixture mutation leaked");
    if (await service.getHospitalById("UNKNOWN")) throw new Error("Unknown hospital should return null");
});
