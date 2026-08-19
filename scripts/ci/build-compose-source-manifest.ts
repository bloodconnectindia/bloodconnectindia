import { canonicalJson } from "./verify-compose-source.ts";

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0"))
    .join("");
const digestBytes = async (bytes: Uint8Array) => {
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return hex(await crypto.subtle.digest("SHA-256", source));
};
const hashFile = async (path: string) => digestBytes(await Deno.readFile(path));

const upstreamAssets: Record<string, string> = {
  "apps/cli-go/internal/db/start/start.go":
    "31107bbf8d82a2e3f0a820d2e2ea3bccd4452d240e6d182019b74c15c35c9b8f",
  "apps/cli-go/internal/db/start/templates/_supabase.sql":
    "6197027ecf418f2b0254af7ac7ceed64b69041a774c5d066b770b986ac9360ba",
  "apps/cli-go/internal/db/start/templates/schema.sql":
    "16b3cf7ae7924c53754eaf433cf24bd9bd2626c36f9eb0dac5ccbf8b23f25532",
  "apps/cli-go/internal/db/start/templates/webhook.sql":
    "6487689b6e66454072030c130f8a66786d9a0cac241474c2efa5fd0dd4c07b7e",
  "apps/cli-go/internal/functions/deploy/bundle.go":
    "586350ca96091d326446c8329772aae4c3740afbb17a4858b477cf0dca7275a5",
  "apps/cli-go/internal/functions/deploy/deploy.go":
    "62465d1f16209f3c53cedd64d943ddb11937d8fba1a7dc57dd6123b4ff5b899b",
  "apps/cli-go/internal/functions/serve/serve.go":
    "20d312622e787bc409a9de3082e0ef6505f5e71a7cf106cc9f3cf46049d1c864",
  "apps/cli-go/internal/functions/serve/templates/main.ts":
    "fcf9b63136b43a6b69de177fe777b77f643a506396ad09b0c25718469d0766b5",
  "apps/cli-go/internal/start/start.go":
    "08b3b726b5eb5d96001795a7f34cc4a7fec623ea72bac36ed257e9733f2e9fbc",
  "apps/cli-go/internal/start/templates/custom_nginx.template":
    "8ec79d6c8fa347cc09185773d57b0df297520e2c12439c5d594986081379226d",
  "apps/cli-go/internal/start/templates/kong.yml":
    "3ceb489169d0ec6b62a77f00abbf6f12d5a59f9de8bacda4c5d5c6d5b3f715a9",
  "apps/cli-go/pkg/config/api.go":
    "a95b8942211d38792bcdb539b76868ce3e4a237d232978721ed66f33b0d4df4a",
  "apps/cli-go/pkg/config/apikeys.go":
    "0f1093152cf4820fcb4a95e5ff85efe68bfcb163754612b5e6a4dfc9b8c8748f",
  "apps/cli-go/pkg/config/auth.go":
    "4e64a86e04a16a8b66dd2cf4f3e3275608d46edbd1d564911c0b1ae1846824f0",
  "apps/cli-go/pkg/config/config.go":
    "bcc98d718cbd65e6f646f24df9cac48624cfdc80f1a343535465617bcb208d0c",
  "apps/cli-go/pkg/config/db.go":
    "e35c3fd0c2fdb17d26abd86520fb58772d99a065c466997707cab30a4ccb42d8",
  "apps/cli-go/pkg/config/templates/Dockerfile":
    "29f22e18d1668cd4eb33d7ff6bd0e069655baa83e1d5860165631fd59c01edbd",
};

const image = (
  tag: string,
  indexDigest: string,
  platformDigest: string,
  configDigest: string,
) => ({ configDigest, indexDigest, platformDigest, tag });

const bundlePaths = [
  "compose/compose.loopback.yaml",
  "compose/runtime/postgres-entrypoint.sh",
  "compose/vendor/supabase-cli/_supabase.sql",
  "compose/vendor/supabase-cli/kong.yml",
  "compose/vendor/supabase-cli/main.ts",
  "compose/vendor/supabase-cli/schema.sql",
  "compose/vendor/supabase-cli/webhook.sql",
  "scripts/ci/build-compose-source-manifest.ts",
  "scripts/ci/cleanup-disposable-integration.sh",
  "scripts/ci/prepare-compose-runtime.ts",
  "scripts/ci/verify-compose-source.ts",
  "scripts/ci/verify-docker-bindings.ts",
  "scripts/local/run-disposable-integration-phase.ps1",
  "supabase/config.toml",
];

const functionPaths: string[] = [];
const collect = async (directory: string) => {
  for await (const entry of Deno.readDir(directory)) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory) await collect(path);
    else if (entry.isFile) functionPaths.push(path);
  }
};
await collect("supabase/functions");

const bundleFiles: Record<string, string> = {};
for (const path of [...bundlePaths, ...functionPaths].sort()) {
  bundleFiles[path] = await hashFile(path);
}

const manifest = {
  bundleFiles,
  images: {
    auth: image(
      "supabase/gotrue:v2.188.1",
      "sha256:87db8c737af49a64236c461882ed3925f8b1e5c2c47176c64694dedc65153573",
      "sha256:61f1099e790c4f364b70d6fb92cc07e5f90275abf2cf690ff045c63f1d96ee4b",
      "sha256:b061f1fa636f31bc01de0a791986352e82772760cce8e1d55bbec6f552930a1e",
    ),
    edgeRuntime: image(
      "supabase/edge-runtime:v1.73.13",
      "sha256:cfa86b9ad11f349aa4b930f3ab295d6ad923f2e43c5513c08d79c1f3b990b486",
      "sha256:e8ddc7b0f4888818159d4b665e922de667948e2864c895ed62acdfd29e7c6c80",
      "sha256:77200576bb98efc3414ec48f0ab02815c4f537813ad71f6330e82cd6779910e0",
    ),
    kong: image(
      "kong:2.8.1",
      "sha256:1b53405d8680a09d6f44494b7990bf7da2ea43f84a258c59717d4539abf09f6d",
      "sha256:e21b0b793879ab96720ed4188f9441260273f4bf775bcbff8d435e019ffb759a",
      "sha256:3cefb958bcd694597b65adc00053a762b1f9a6df3c6031af528d052d75a64e1a",
    ),
    mailpit: image(
      "axllent/mailpit:v1.22.3",
      "sha256:f7f7c31de4de59540ad6515a0ca057a77525bca2069b6e747d873ca66c10fe08",
      "sha256:168f762c218e167ba88ae7e48194126eb5ba5e99ef652063e3f14f9c4f0ee70f",
      "sha256:3f56e44ddc1a5655b8f288a2aa812db567b2f5f0b8bc18ef3da63b94a95608d5",
    ),
    postgres: image(
      "supabase/postgres:17.6.1.106",
      "sha256:21ab971149317ea9cd12a8126fe4ebb34def08c8972956b0958cba0924409dab",
      "sha256:5e52ca81790ae3aa1c2f8c20df41dd96404c8ab29632dddf113b881de785ee92",
      "sha256:9ff6402f578a9b0d4f2aa31f660bd398b8e378761d61d31efda6ff9ad92408e5",
    ),
    postgrest: image(
      "postgrest/postgrest:v14.10",
      "sha256:bca3f86f69d8ef7aa1e5ee65e66ce9a20c6c147be637517a7be8399e102901d1",
      "sha256:78c0a947ae556093def31de0b76c37d36ca09394d603a6e61785f4c0008aeb12",
      "sha256:fe5428d51d9805147859ed38db0a26e9e424c4639dc851733e99a86829e1d5aa",
    ),
  },
  network: {
    external: true,
    name: "bloodconnectindia-disposable-loopback",
    requiredOptions: {
      "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1",
    },
  },
  provenance: {
    annotatedTagObject: "f97feddea6b1f6dd7598d5548985ae935abf3270",
    commitTree: "fddbcd3a72c24152043b275924917e4040aceab0",
    peeledCommit: "b2f10f0169954f5d5ee4f03b49442666532f82fd",
    repository: "https://github.com/supabase/cli.git",
    tag: "v2.101.0",
    upstreamAssets,
  },
  publishedPorts: [
    { hostIp: "127.0.0.1", published: 54321, service: "kong", target: 8000 },
    {
      hostIp: "127.0.0.1",
      published: 54322,
      service: "postgres",
      target: 5432,
    },
    { hostIp: "127.0.0.1", published: 54324, service: "mailpit", target: 8025 },
  ],
  repositoryInputs: {
    edgeFunctionFiles: Object.fromEntries(
      functionPaths.sort().map((path) => [path, bundleFiles[path]]),
    ),
    supabaseConfig: {
      path: "supabase/config.toml",
      sha256: bundleFiles["supabase/config.toml"],
    },
  },
  schemaVersion: 1,
  securityAssertions: [
    "approval marker binds exact phase driver SHA-256",
    "canonical manifest binds Compose assets helpers config and Edge Function inputs",
    "all host publications use long syntax and host_ip 127.0.0.1",
    "Auth REST Edge SMTP migration and service traffic are internal-only",
    "controlled migrations are quarantined and never auto-mounted",
    "rendered Kong credentials and all generated secrets remain in run-scoped temporary storage",
    "cleanup is scoped to the exact Compose project run and preserves restoration failure precedence",
    "remote project state and non-loopback listeners fail closed",
    "post-start Docker inspection verifies every published and internal-only binding",
  ],
  target: "linux/amd64",
};

const canonical = `${canonicalJson(manifest)}\n`;
await Deno.writeTextFile("compose/source-manifest.json", canonical);
const digest = await digestBytes(new TextEncoder().encode(canonical));
await Deno.writeTextFile("compose/source-manifest.sha256", `${digest}\n`);
console.log(digest);
