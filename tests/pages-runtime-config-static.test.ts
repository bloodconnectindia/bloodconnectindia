import {
  injectRuntimeConfig,
  renderRuntimeConfig,
  validateProductionConfig,
} from "../scripts/ci/build-pages-site.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));
const publishable = `sb_publishable_${"a".repeat(24)}`;
const expectedSupabasePages = [
  "pages/admin-blood-banks.html",
  "pages/admin-blood-requests.html",
  "pages/admin-blood-stock.html",
  "pages/admin-dashboard.html",
  "pages/admin-demo-management.html",
  "pages/admin-donors.html",
  "pages/admin-forgot-password.html",
  "pages/admin-hospitals.html",
  "pages/admin-reset-password.html",
  "pages/admin-users.html",
  "pages/blood-request.html",
  "pages/login.html",
];

function rejected(url: string | undefined, key: string | undefined, expected: string) {
  try {
    validateProductionConfig(url, key);
  } catch (error) {
    if (error instanceof Error && error.message.includes(expected)) return;
    throw error;
  }
  throw new Error(`Expected production configuration rejection containing: ${expected}`);
}

Deno.test("Pages production configuration rejects missing and malformed inputs", () => {
  rejected(undefined, publishable, "BCI_SUPABASE_URL is required");
  rejected("not-a-url", publishable, "absolute URL");
  rejected("https://project.example.test", undefined, "BCI_SUPABASE_PUBLISHABLE_KEY is required");
});

Deno.test("Pages production URL rejects local, insecure, and non-origin values", () => {
  for (const url of [
    "http://project.example.test",
    "http://127.0.0.1:54321",
    "https://localhost:54321",
  ]) rejected(url, publishable, url.startsWith("http:") ? "HTTPS" : "loopback");
  for (const url of [
    "https://user:password@project.example.test",
    "https://project.example.test/rest/v1",
    "https://project.example.test?query=value",
    "https://project.example.test/#fragment",
  ]) rejected(url, publishable, "credential-free origin");
});

Deno.test("Pages production key rejects privileged and secret-like material", () => {
  for (const key of [
    "service_role",
    "sb_secret_example",
    "SUPABASE_SERVICE_ROLE_KEY=example",
    `sb_publishable_service_role_${"a".repeat(24)}`,
    "database-password",
    "access_token_example",
    "refresh_token_example",
    "jwt_signing_secret_example",
  ]) rejected("https://project.example.test", key, "browser-safe");
});

Deno.test("valid Pages configuration renders the exact production runtime object", () => {
  const config = validateProductionConfig("https://project.example.test/", publishable);
  if (config.environment !== "production" || config.url !== "https://project.example.test" || config.publishableKey !== publishable) {
    throw new Error("Validated production configuration changed unexpectedly");
  }
  const generated = renderRuntimeConfig(config);
  const fakeWindow: Record<string, unknown> = {};
  new Function("window", generated)(fakeWindow);
  const runtime = fakeWindow.__BLOODCONNECT_SUPABASE_CONFIG__ as Record<string, unknown>;
  if (JSON.stringify(Object.keys(runtime)) !== JSON.stringify(["environment", "url", "publishableKey"])) {
    throw new Error("Generated runtime object has unexpected properties");
  }
  if (runtime.environment !== "production" || runtime.url !== config.url || runtime.publishableKey !== publishable) {
    throw new Error("Generated runtime object does not match validated public inputs");
  }
  for (const forbidden of ["service_role", "sb_secret_", "postgres://", "postgresql://", "access_token", "refresh_token", "jwt_signing_secret"]) {
    if (generated.toLowerCase().includes(forbidden)) throw new Error(`Generated runtime contains forbidden material: ${forbidden}`);
  }
});

Deno.test("every Supabase page receives runtime configuration in the required order", async () => {
  for (const path of expectedSupabasePages) {
    const source = await read(path);
    const generated = injectRuntimeConfig(source, path);
    const boundary = generated.indexOf("../js/supabase-config.js");
    const runtime = generated.indexOf("../js/supabase-runtime-config.js");
    const client = generated.indexOf("../js/supabase.js");
    if (boundary < 0 || runtime <= boundary || client <= runtime) {
      throw new Error(`${path} has invalid runtime script ordering`);
    }
    if ((generated.match(/supabase-runtime-config\.js/g) ?? []).length !== 1) {
      throw new Error(`${path} received runtime configuration more than once`);
    }
  }
  for (const path of ["pages/login.html", "pages/admin-forgot-password.html", "pages/admin-reset-password.html"]) {
    const generated = injectRuntimeConfig(await read(path), path);
    if (!generated.includes("../js/supabase-runtime-config.js")) throw new Error(`${path} lacks the common runtime boundary`);
  }
});

Deno.test("repository has no committed generated production runtime file", async () => {
  try {
    await read("js/supabase-runtime-config.js");
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
  throw new Error("Generated production runtime configuration was committed");
});

Deno.test("Pages workflow uses only public variables and a generated artifact", async () => {
  const workflow = await read(".github/workflows/pages.yml");
  for (const required of [
    "vars.BCI_SUPABASE_URL",
    "vars.BCI_SUPABASE_PUBLISHABLE_KEY",
    "build-pages-site.ts _site",
    "--allow-env=BCI_SUPABASE_URL,BCI_SUPABASE_PUBLISHABLE_KEY",
    "actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d",
    "actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9",
    "actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128",
    "pages: write",
    "id-token: write",
  ]) if (!workflow.includes(required)) throw new Error(`Pages workflow is missing ${required}`);
  for (const forbidden of [
    "secrets.BCI_SUPABASE",
    "SUPABASE_SERVICE_ROLE",
    "SUPABASE_ACCESS_TOKEN",
    "database_url",
    "db_password",
    "supabase db push",
    "supabase functions deploy",
  ]) if (workflow.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`Pages workflow contains forbidden material: ${forbidden}`);
  const generate = workflow.indexOf("build-pages-site.ts _site");
  const upload = workflow.indexOf("actions/upload-pages-artifact@");
  const deploy = workflow.indexOf("actions/deploy-pages@");
  if (generate < 0 || upload <= generate || deploy <= upload) throw new Error("Pages workflow generation/deployment order is invalid");
});

Deno.test("authentication routing remains server verified and browser role neutral", async () => {
  const login = await read("pages/login.html");
  const auth = await read("js/auth.js");
  if (/<select\b/i.test(login) || /name="role"/i.test(login)) throw new Error("Common Login gained a role selector");
  for (const required of [
    'functions.invoke("admin-login"',
    "data?.verified_identity",
    'identity?.role === "Admin"',
    'identity?.status === "Active"',
    "does not have a verified supported destination",
  ]) if (!auth.includes(required)) throw new Error(`Verified routing requirement is missing: ${required}`);
});
