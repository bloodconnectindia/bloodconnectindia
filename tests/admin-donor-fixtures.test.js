globalThis.window = globalThis;
await import("../js/admin-fixtures.js");

const service = globalThis.BloodConnectAdminFixtures;
const validDonor = { fullName: "Fixture Donor", mobile: "9876500000", email: "new@example.test", bloodGroup: "B+", consent: true };

Deno.test("donor fixtures paginate, filter, and return isolated details", async () => {
    const all = await service.getDonors({});
    if (all.total !== 10 || all.items.length !== 5 || all.totalPages !== 2) throw new Error("Unexpected fixture pagination");
    const filtered = await service.getDonors({ bloodGroup: "O-", availability: "Available" });
    if (filtered.total !== 1 || filtered.items[0].id !== "DN-2026-0178") throw new Error("Unexpected filter result");
    const detail = await service.getDonorById("DN-2026-0186");
    if (!detail || detail.fullName !== "Riya Patel") throw new Error("Fixture detail lookup failed");
});

Deno.test("donor registration rejects duplicates and invalid payloads", async () => {
    await assertFixtureError({ ...validDonor, mobile: "9876552001" }, "DUPLICATE_FIXTURE_DONOR");
    await assertFixtureError({ ...validDonor, email: "riya.fixture@example.test" }, "DUPLICATE_FIXTURE_DONOR");
    await assertFixtureError({ fullName: "X", mobile: "123", email: "bad", bloodGroup: "ADMIN", consent: false }, "INVALID_FIXTURE_DONOR");
});

Deno.test("donor registration accepts a valid fixture payload without persistence", async () => {
    const created = await service.registerDonor(validDonor);
    if (!created.accepted || !created.fixtureId.startsWith("DN-LOCAL-")) throw new Error("Valid fixture registration was not accepted");
    const after = await service.getDonors({});
    if (after.total !== 10) throw new Error("Fixture registration unexpectedly persisted data");
});

async function assertFixtureError(payload, expected) {
    try {
        await service.registerDonor(payload);
    } catch (error) {
        if (error.message === expected) return;
        throw error;
    }
    throw new Error(`Expected ${expected}`);
}
