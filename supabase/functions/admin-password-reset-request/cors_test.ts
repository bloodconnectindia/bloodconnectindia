import { handleAdminPasswordResetRequest } from "./index.ts";

const productionOrigin = "https://bloodconnectindia.org";
const expectedHeaders = "authorization, x-client-info, apikey, content-type";
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const request = (method: string, origin = productionOrigin, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("https://project.example.test/functions/v1/admin-password-reset-request", {
    method,
    headers: { origin, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const assertCors = (response: Response, origin = productionOrigin) => {
  assert(response.headers.get("access-control-allow-origin") === origin, "production origin is not allowed");
  assert(response.headers.get("access-control-allow-methods") === "POST, OPTIONS", "allowed methods differ");
  assert(response.headers.get("access-control-allow-headers") === expectedHeaders, "allowed headers differ");
};

Deno.test("production OPTIONS preflight succeeds before security dependencies load", async () => {
  let loaded = false;
  const response = await handleAdminPasswordResetRequest(request("OPTIONS", productionOrigin, undefined, {
    "access-control-request-method": "POST",
    "access-control-request-headers": "authorization, x-client-info, apikey, content-type",
  }), async () => {
    loaded = true;
    throw new Error("security loader must not run for preflight");
  });
  assert(response.status === 204, `expected 204, got ${response.status}`);
  assert(!loaded, "preflight initialized privileged dependencies");
  assertCors(response);
});

Deno.test("preflight rejects unsupported methods and headers with CORS retained", async () => {
  const method = await handleAdminPasswordResetRequest(request("OPTIONS", productionOrigin, undefined, {
    "access-control-request-method": "DELETE",
  }));
  assert(method.status === 405, "unsupported preflight method was not rejected");
  assertCors(method);
  const header = await handleAdminPasswordResetRequest(request("OPTIONS", productionOrigin, undefined, {
    "access-control-request-method": "POST",
    "access-control-request-headers": "authorization, x-privileged-secret",
  }));
  assert(header.status === 400, "unsupported preflight header was not rejected");
  assertCors(header);
});

Deno.test("normal POST stays generic and retains production CORS", async () => {
  let resetRequested = false;
  let auditWritten = false;
  const sql = async (strings: TemplateStringsArray) => {
    if (strings[0].includes("select 1")) return [{}];
    auditWritten = true;
    return [];
  };
  const response = await handleAdminPasswordResetRequest(request("POST", productionOrigin, {
    email: "admin@example.invalid",
  }), async () => ({
    sql,
    serviceAuth: { auth: { resetPasswordForEmail: async () => { resetRequested = true; } } },
  }) as never);
  assert(response.status === 200, "normal POST failed");
  assertCors(response);
  assert(resetRequested && auditWritten, "eligible reset path did not complete");
  assert(JSON.stringify(await response.json()) === JSON.stringify({ accepted: true }), "response is not generic");
});

Deno.test("validation and unexpected errors retain generic CORS responses", async () => {
  const malformed = new Request("https://project.example.test/functions/v1/admin-password-reset-request", {
    method: "POST",
    headers: { origin: productionOrigin, "content-type": "application/json" },
    body: "{",
  });
  const malformedResponse = await handleAdminPasswordResetRequest(malformed, async () => ({}) as never);
  assert(malformedResponse.status === 200, "malformed request changed enumeration-safe status");
  assertCors(malformedResponse);
  const failed = await handleAdminPasswordResetRequest(request("POST", productionOrigin, { email: "x@example.invalid" }), async () => {
    throw new Error("synthetic server failure");
  });
  assert(failed.status === 200, "unexpected failure changed enumeration-safe status");
  assertCors(failed);
});

Deno.test("disallowed origins fail closed without an allow-origin header", async () => {
  for (const method of ["OPTIONS", "POST"]) {
    const response = await handleAdminPasswordResetRequest(request(method, "https://attacker.example"));
    assert(response.status === 403, `${method} disallowed origin was not rejected`);
    assert(response.headers.get("access-control-allow-origin") === null, "disallowed origin received CORS access");
  }
});

Deno.test("CORS implementation contains no credential or key material", async () => {
  const sources = await Promise.all([
    Deno.readTextFile(new URL("../_shared/cors.ts", import.meta.url)),
    Deno.readTextFile(new URL("./index.ts", import.meta.url)),
  ]);
  const combined = sources.join("\n");
  for (const forbidden of ["sb_secret_", "service_role.", "postgres://", "postgresql://", "admin password"] ) {
    assert(!combined.toLowerCase().includes(forbidden), `credential marker present: ${forbidden}`);
  }
});
