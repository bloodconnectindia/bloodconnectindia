await import("../js/supabase-config.js");

type BrowserConfig = {
  environment: string;
  url: string;
  publishableKey: string;
};
type ConfigBoundary = {
  resolve(config: BrowserConfig | undefined, location: { hostname: string }): BrowserConfig;
  isBrowserPublishableKey(value: string): boolean;
};

const boundary = (globalThis as unknown as { BloodConnectSupabaseConfig: ConfigBoundary })
  .BloodConnectSupabaseConfig;
const publishable = `sb_publishable_${"a".repeat(24)}`;
const base64url = (value: string) => btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const now = Math.floor(Date.now() / 1000);
const jwt = (payload: Record<string, unknown>, header = { alg: "HS256", typ: "JWT" }) =>
  `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}.${"a".repeat(32)}`;
const anon = jwt({ iss: "supabase", role: "anon", iat: now - 60, exp: now + 3600 });

function rejects(config: BrowserConfig | undefined, hostname: string, expected: string) {
  try {
    boundary.resolve(config, { hostname });
  } catch (error) {
    if (error instanceof Error && error.message.includes(expected)) return;
    throw error;
  }
  throw new Error(`Expected configuration rejection containing: ${expected}`);
}

Deno.test("missing browser configuration fails closed", () => {
  rejects(undefined, "localhost", "is required");
  rejects({ environment: "local", url: "", publishableKey: publishable }, "localhost", "url is required");
  rejects({ environment: "local", url: "http://127.0.0.1:54321", publishableKey: "" }, "localhost", "publishableKey is required");
});

Deno.test("missing runtime configuration never creates a Supabase client", async () => {
  const bootstrap = await Deno.readTextFile(new URL("../js/supabase.js", import.meta.url));
  let clientCreated = false;
  const fakeWindow = {
    BloodConnectSupabaseConfig: boundary,
    __BLOODCONNECT_SUPABASE_CONFIG__: undefined,
    location: { hostname: "localhost" },
    supabase: { createClient: () => { clientCreated = true; } },
  };
  try {
    new Function("window", bootstrap)(fakeWindow);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("is required")) throw error;
  }
  if (clientCreated) throw new Error("Client was created without configuration");
});

Deno.test("localhost cannot silently target a hosted project", () => {
  for (const environment of ["local", "dev", "test", "preview", "production"]) {
    rejects({ environment, url: "https://example.supabase.co", publishableKey: publishable }, "localhost", "cannot target a hosted");
  }
  const local = boundary.resolve(
    { environment: "local", url: "http://127.0.0.1:54321", publishableKey: publishable },
    { hostname: "localhost" },
  );
  if (local.url !== "http://127.0.0.1:54321" || local.environment !== "local") {
    throw new Error("Explicit loopback configuration was not preserved");
  }
});

Deno.test("supported environments are an exact allowlist", () => {
  const accepted = ["local", "dev", "test", "preview", "production"];
  for (const environment of accepted) {
    const loopback = environment === "local";
    const resolved = boundary.resolve({
      environment,
      url: loopback ? "http://127.0.0.1:54321" : `https://${environment}.example.test`,
      publishableKey: publishable,
    }, { hostname: loopback ? "localhost" : `${environment}.example.test` });
    if (resolved.environment !== environment) throw new Error(`${environment} was not preserved`);
  }
  for (const environment of ["", "development", "staging", "prod", "live"]) {
    rejects({ environment, url: "https://example.test", publishableKey: publishable }, "example.test", "environment must be");
  }
});

Deno.test("service-role and secret-like browser keys are rejected", () => {
  for (const key of ["service_role", "sb_secret_example", "SUPABASE_SERVICE_ROLE_KEY=example", "secret-value", `sb_publishable_service_role_${"a".repeat(24)}`]) {
    rejects({ environment: "preview", url: "https://preview.example.test", publishableKey: key }, "preview.example.test", "browser key");
  }
});

Deno.test("publishable and legacy anon credentials remain supported", () => {
  for (const key of [publishable, anon]) {
    if (!boundary.isBrowserPublishableKey(key)) throw new Error("Browser-safe key was rejected");
    const preview = boundary.resolve(
      { environment: "preview", url: "https://preview.example.test", publishableKey: key },
      { hostname: "preview.example.test" },
    );
    if (preview.publishableKey !== key) throw new Error("Browser-safe key changed");
  }
  for (const rejected of [
    jwt({ iss: "supabase", role: "service_role", iat: now - 60, exp: now + 3600 }),
    jwt({ iss: "supabase", role: "anon", iat: now - 3600, exp: now - 1 }),
    jwt({ iss: "other", role: "anon", iat: now - 60, exp: now + 3600 }),
    jwt({ iss: "supabase", role: "anon", iat: now - 60, exp: now + 3600 }, { alg: "none", typ: "JWT" }),
  ]) {
    if (boundary.isBrowserPublishableKey(rejected)) throw new Error("Unsafe legacy JWT was accepted");
  }
});

Deno.test("configuration URLs reject credentials, paths, queries, and fragments", () => {
  for (const url of [
    "https://user:password@preview.example.test",
    "https://preview.example.test/rest/v1",
    "https://preview.example.test/?target=other",
    "https://preview.example.test/#fragment",
  ]) {
    rejects({ environment: "preview", url, publishableKey: publishable }, "preview.example.test", "credential-free Supabase origin");
  }
});

Deno.test("production requires explicit HTTPS non-loopback values", () => {
  rejects({ environment: "production", url: "http://production.example.test", publishableKey: publishable }, "app.example.test", "must use HTTPS");
  rejects({ environment: "production", url: "http://127.0.0.1:54321", publishableKey: publishable }, "localhost", "production requires");
  const production = boundary.resolve(
    { environment: "production", url: "https://project.example.test", publishableKey: publishable },
    { hostname: "app.example.test" },
  );
  if (production.environment !== "production") throw new Error("Explicit production environment was not retained");
});

Deno.test("all Supabase pages load the boundary before client bootstrap", async () => {
  const root = new URL("../", import.meta.url);
  const pages = [
    "pages/admin-blood-stock.html", "pages/admin-dashboard.html",
    "pages/admin-blood-requests.html", "pages/admin-demo-management.html",
    "pages/admin-blood-banks.html", "pages/admin-hospitals.html",
    "pages/admin-forgot-password.html", "pages/admin-donors.html",
    "pages/admin-login.html", "pages/admin-reset-password.html",
    "pages/admin-users.html", "pages/blood-request.html",
  ];
  for (const page of pages) {
    const html = await Deno.readTextFile(new URL(page, root));
    const boundaryPosition = html.indexOf("../js/supabase-config.js");
    const clientPosition = html.indexOf("../js/supabase.js");
    if (boundaryPosition < 0 || clientPosition <= boundaryPosition) {
      throw new Error(`${page} does not load the configuration boundary first`);
    }
  }

  const bootstrap = await Deno.readTextFile(new URL("js/supabase.js", root));
  for (const forbidden of ["supabase.co", "sb_publishable_", "service_role", "sb_secret_"]) {
    if (bootstrap.toLowerCase().includes(forbidden)) {
      throw new Error(`Client bootstrap embeds forbidden configuration: ${forbidden}`);
    }
  }
  if (!bootstrap.includes("window.__BLOODCONNECT_SUPABASE_CONFIG__")) {
    throw new Error("Client bootstrap does not require explicit runtime configuration");
  }
});
