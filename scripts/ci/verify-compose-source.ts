const encoder = new TextEncoder();

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const sha256 = async (bytes: Uint8Array) => {
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return hex(await crypto.subtle.digest("SHA-256", source));
};

export const validateComposeText = (compose: string) => {
  const requiredImages = [
    "supabase/postgres:17.6.1.106@sha256:5e52ca81790ae3aa1c2f8c20df41dd96404c8ab29632dddf113b881de785ee92",
    "kong:2.8.1@sha256:e21b0b793879ab96720ed4188f9441260273f4bf775bcbff8d435e019ffb759a",
    "supabase/gotrue:v2.188.1@sha256:61f1099e790c4f364b70d6fb92cc07e5f90275abf2cf690ff045c63f1d96ee4b",
    "postgrest/postgrest:v14.10@sha256:78c0a947ae556093def31de0b76c37d36ca09394d603a6e61785f4c0008aeb12",
    "supabase/edge-runtime:v1.73.13@sha256:e8ddc7b0f4888818159d4b665e922de667948e2864c895ed62acdfd29e7c6c80",
    "axllent/mailpit:v1.22.3@sha256:168f762c218e167ba88ae7e48194126eb5ba5e99ef652063e3f14f9c4f0ee70f",
  ];
  for (const image of requiredImages) {
    if (!compose.includes(`image: ${image}`)) {
      throw new Error(`Image pin rejected: ${image}`);
    }
  }
  const imageLines = compose.match(/^\s+image:\s+\S+$/gm) ?? [];
  if (
    imageLines.length !== 7 ||
    imageLines.some((line) => !line.includes("@sha256:"))
  ) {
    throw new Error(
      "Every service image must use an immutable platform digest",
    );
  }
  const publications = [...compose.matchAll(
    /target:\s*(\d+)\s*\r?\n\s+published:\s*"(\d+)"\s*\r?\n\s+host_ip:\s*([^\s]+)/g,
  )].map((match) => `${match[3]}:${match[2]}:${match[1]}`).sort();
  const expected = [
    "127.0.0.1:54321:8000",
    "127.0.0.1:54322:5432",
    "127.0.0.1:54324:8025",
  ];
  if (
    (compose.match(/^\s+published:/gm) ?? []).length !== 3 ||
    (compose.match(/^\s+host_ip:/gm) ?? []).length !== 3
  ) {
    throw new Error(
      "Exactly three host publications with host_ip are required",
    );
  }
  if (JSON.stringify(publications) !== JSON.stringify(expected)) {
    throw new Error(
      "Host publications are not the exact approved loopback set",
    );
  }
  if (/^\s+-\s+["']?(?:127\.0\.0\.1:)?\d+:\d+/m.test(compose)) {
    throw new Error("Short-form port syntax is forbidden");
  }
  for (
    const required of [
      "name: bloodconnectindia-disposable-loopback",
      "external: true",
      "../supabase/functions",
      "auth-migration:",
      "condition: service_completed_successfully",
      "no-new-privileges:true",
    ]
  ) {
    if (!compose.includes(required)) {
      throw new Error(`Compose guard missing: ${required}`);
    }
  }
  for (
    const forbidden of [
      "supabase/migrations",
      "/docker-entrypoint-initdb.d",
      "studio:",
      "realtime:",
      "storage:",
      "analytics:",
      "pooler:",
    ]
  ) {
    if (compose.includes(forbidden)) {
      throw new Error(`Forbidden topology input: ${forbidden}`);
    }
  }
};

export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${
    Object.keys(object).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(object[key])}`
    ).join(",")
  }}`;
};

export const selectFirstFailure = (statuses: number[]) =>
  statuses.find((status) => status !== 0) ?? 0;

if (import.meta.main) {
  const manifestPath = "compose/source-manifest.json";
  const digestPath = "compose/source-manifest.sha256";
  const manifestBytes = await Deno.readFile(manifestPath);
  const manifestText = new TextDecoder().decode(manifestBytes);
  const manifest = JSON.parse(manifestText);
  if (manifestText !== `${canonicalJson(manifest)}\n`) {
    throw new Error("Source manifest is not canonically serialized");
  }
  const expectedDigest = (await Deno.readTextFile(digestPath)).trim();
  if (
    !/^[0-9a-f]{64}$/.test(expectedDigest) ||
    await sha256(manifestBytes) !== expectedDigest
  ) {
    throw new Error("Canonical source-manifest digest mismatch");
  }
  if (manifest.schemaVersion !== 1 || manifest.target !== "linux/amd64") {
    throw new Error("Source manifest platform/schema rejected");
  }
  const files = manifest.bundleFiles as Record<string, string>;
  for (const [path, expected] of Object.entries(files)) {
    const actual = await sha256(await Deno.readFile(path));
    if (actual !== expected) throw new Error(`Bundle hash mismatch: ${path}`);
  }
  validateComposeText(await Deno.readTextFile("compose/compose.loopback.yaml"));
  console.log(`Verified canonical Compose source manifest ${expectedDigest}.`);
}
