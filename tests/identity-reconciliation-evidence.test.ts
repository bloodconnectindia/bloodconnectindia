const root = new URL("../", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));
const evidence = await read(
  "supabase/staged-migrations/202608170001_identity_reconciliation_evidence.sql",
);
const plan = await read("supabase/IDENTITY_RECONCILIATION_PLAN.md");
const manifest = JSON.parse(await read("supabase/migration-manifest.json"));
const driver = await read("scripts/ci/run-disposable-integration-phase.sh");

type UserRow = {
  legacy: string | null;
  canonical: string | null;
  role?: string;
};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function summarize(rows: UserRow[], authIds: Set<string>) {
  const legacyCounts = new Map<string, number>();
  const legacyUuidCounts = new Map<string, number>();
  const canonicalCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.legacy !== null) {
      legacyCounts.set(row.legacy, (legacyCounts.get(row.legacy) ?? 0) + 1);
      if (uuidPattern.test(row.legacy)) {
        const parsed = row.legacy.toLowerCase();
        legacyUuidCounts.set(parsed, (legacyUuidCounts.get(parsed) ?? 0) + 1);
      }
    }
    if (row.canonical !== null) {
      canonicalCounts.set(
        row.canonical,
        (canonicalCounts.get(row.canonical) ?? 0) + 1,
      );
    }
  }
  const assessed = rows.map((row) => {
    const valid = row.legacy !== null && uuidPattern.test(row.legacy);
    const legacyUuid = valid ? row.legacy!.toLowerCase() : null;
    const matched = legacyUuid !== null && authIds.has(legacyUuid);
    const duplicate = row.legacy !== null &&
      (legacyCounts.get(row.legacy) ?? 0) > 1;
    const occupied = legacyUuid !== null &&
      ((legacyUuidCounts.get(legacyUuid) ?? 0) > 1 ||
        (canonicalCounts.get(legacyUuid) ?? 0) >
          (row.canonical?.toLowerCase() === legacyUuid ? 1 : 0));
    const inconsistent = row.canonical !== null &&
      (legacyUuid === null || row.canonical.toLowerCase() !== legacyUuid ||
        !authIds.has(row.canonical.toLowerCase()));
    const eligible = valid && !duplicate && matched && !occupied &&
      !inconsistent;
    const privileged = ["admin", "super admin"].includes(
      (row.role ?? "").trim().toLowerCase(),
    );
    return {
      valid,
      matched,
      duplicate,
      occupied,
      inconsistent,
      eligible,
      privileged,
    };
  });
  const duplicateGroups =
    [...legacyCounts.values()].filter((count) => count > 1).length;
  const result = {
    total_public_users_rows: rows.length,
    null_legacy_user_id_rows: rows.filter((row) => row.legacy === null).length,
    malformed_legacy_uuid_text_rows:
      rows.filter((row, index) => row.legacy !== null && !assessed[index].valid)
        .length,
    duplicate_legacy_user_id_groups: duplicateGroups,
    duplicate_legacy_user_id_rows:
      assessed.filter((row) => row.duplicate).length,
    legacy_ids_unmatched_to_auth_rows:
      assessed.filter((row, index) =>
        rows[index].legacy !== null && row.valid && !row.matched
      ).length,
    prospective_auth_user_id_conflict_rows:
      assessed.filter((row) => row.occupied).length,
    rows_already_carrying_auth_user_id:
      rows.filter((row) => row.canonical !== null).length,
    inconsistent_auth_user_id_rows:
      assessed.filter((row) => row.inconsistent).length,
    privileged_mapping_anomaly_rows:
      assessed.filter((row) => row.privileged && !row.eligible).length,
    public_only_or_non_auth_rows: assessed.filter((row) => !row.matched).length,
    eligible_mapping_rows: assessed.filter((row) => row.eligible).length,
  };
  return {
    ...result,
    future_backfill_decision:
      Object.entries(result).every(([key, value]) =>
          key === "total_public_users_rows" ||
          key === "rows_already_carrying_auth_user_id" ||
          key === "eligible_mapping_rows" || value === 0
        ) && result.eligible_mapping_rows === result.total_public_users_rows
        ? "GO"
        : "NO_GO",
  };
}

const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const C = "10000000-0000-4000-8000-000000000003";

Deno.test("evidence SQL is read-only, aggregate-only, and non-runnable", () => {
  const sql = evidence.replace(/^\s*--.*$/gm, "");
  if (
    !/begin transaction isolation level repeatable read read only/i.test(sql)
  ) throw new Error("Read-only snapshot missing");
  for (
    const forbidden of [
      /^\s*(insert|update|delete|truncate|create|alter|drop|rename|merge|grant|revoke)\b/im,
      /\bloop\b/i,
    ]
  ) {
    if (forbidden.test(sql)) {
      throw new Error(`Forbidden evidence operation: ${forbidden}`);
    }
  }
  for (
    const required of [
      "future_backfill_decision",
      "privileged_mapping_anomaly_rows",
      "public_only_or_non_auth_rows",
      "eligible_mapping_rows",
    ]
  ) {
    if (!evidence.includes(required)) {
      throw new Error(`Missing aggregate: ${required}`);
    }
  }
  if (
    manifest.runnableMigrations.some((name: string) =>
      name.includes("identity_reconciliation_evidence")
    )
  ) throw new Error("Evidence script entered runnable manifest");
  if (!driver.includes("identity-evidence)")) {
    throw new Error("Guarded disposable evidence phase missing");
  }
});

Deno.test("legacy identity preflight accepts only authoritative text types", () => {
  const userIdCheck = evidence.match(
    /a\.attname = 'user_id'([\s\S]*?)a\.attnum > 0/,
  )?.[1];
  if (!userIdCheck) throw new Error("Legacy identity type preflight missing");

  const allowlist = userIdCheck.match(
    /format_type\(a\.atttypid, a\.atttypmod\)\s*in\s*\(([^)]+)\)/i,
  )?.[1].match(/'([^']+)'/g)?.map((value) => value.slice(1, -1));
  if (!allowlist || JSON.stringify(allowlist) !== JSON.stringify(["text", "character varying"])) {
    throw new Error(`Unexpected legacy identity type allowlist: ${allowlist}`);
  }

  for (const accepted of ["text", "character varying"]) {
    if (!allowlist.includes(accepted)) throw new Error(`${accepted} was rejected`);
  }
  for (const rejected of ["uuid", "varchar", "character", "citext", "bytea"]) {
    if (allowlist.includes(rejected)) throw new Error(`${rejected} was accepted`);
  }
});

Deno.test("clean, malformed, duplicate, unmatched, null, and conflicting cases follow the contract", () => {
  const clean = summarize([{ legacy: A, canonical: null }, {
    legacy: B,
    canonical: B,
    role: "Admin",
  }], new Set([A, B]));
  if (
    clean.future_backfill_decision !== "GO" || clean.eligible_mapping_rows !== 2
  ) throw new Error("Clean population rejected");
  if (
    summarize([{ legacy: "invalid", canonical: null }], new Set())
      .malformed_legacy_uuid_text_rows !== 1
  ) throw new Error("Malformed identity missed");
  if (
    summarize(
      [{ legacy: A, canonical: null }, { legacy: A, canonical: null }],
      new Set([A]),
    ).duplicate_legacy_user_id_rows !== 2
  ) throw new Error("Duplicate identities missed");
  if (
    summarize([{ legacy: A, canonical: null }, {
      legacy: A.toUpperCase(),
      canonical: null,
    }], new Set([A])).prospective_auth_user_id_conflict_rows !== 2
  ) throw new Error("Parsed UUID ambiguity missed");
  if (
    summarize([{ legacy: A, canonical: null }], new Set())
      .legacy_ids_unmatched_to_auth_rows !== 1
  ) throw new Error("Unmatched identity missed");
  if (
    summarize([{ legacy: null, canonical: null }], new Set())
      .null_legacy_user_id_rows !== 1
  ) throw new Error("Null identity missed");
  if (
    summarize([{ legacy: A, canonical: B }], new Set([A, B]))
      .inconsistent_auth_user_id_rows !== 1
  ) throw new Error("Canonical conflict missed");
  if (
    summarize(
      [{ legacy: A, canonical: null }, { legacy: B, canonical: A }],
      new Set([A, B]),
    ).prospective_auth_user_id_conflict_rows !== 1
  ) throw new Error("Prospective conflict missed");
});

Deno.test("privileged failures block and aggregate output cannot disclose identifiers", () => {
  const result = summarize([
    { legacy: null, canonical: null, role: "Admin" },
    { legacy: C, canonical: null, role: "Super Admin" },
  ], new Set());
  if (
    result.privileged_mapping_anomaly_rows !== 2 ||
    result.future_backfill_decision !== "NO_GO"
  ) throw new Error("Privileged anomaly did not block");
  const serialized = JSON.stringify(result);
  for (const forbidden of [A, B, C, "email", "phone", "token", "name"]) {
    if (serialized.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new Error("Aggregate output leaked protected material");
    }
  }
});

Deno.test("plan records scale, blocking conditions, and deferred service-experience rating", () => {
  for (
    const required of [
      "1,000,000",
      "stable public-users primary key",
      "Fulfilled",
      "Completed",
      "BloodConnectIndia Service Experience",
      "not a donor, hospital, or blood-bank rating",
    ]
  ) {
    if (!plan.includes(required)) {
      throw new Error(`Planning requirement missing: ${required}`);
    }
  }
});
