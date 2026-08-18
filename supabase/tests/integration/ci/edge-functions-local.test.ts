// Runner-local integration preparation. Values are supplied by the disposable
// fixture bootstrap; this file never logs credentials, tokens, headers, or bodies.
const base = "http://127.0.0.1:54321/functions/v1";
const origin = "http://127.0.0.1:3000";
const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing disposable test input: ${name}`);
  return value;
};
const anonKey = required("BCI_LOCAL_ANON_KEY");
const serviceKey = required("BCI_LOCAL_SERVICE_ROLE_KEY");
const adminEmail = required("BCI_TEST_ADMIN_EMAIL");
const adminPassword = required("BCI_TEST_ADMIN_PASSWORD");
const inactiveEmail = required("BCI_TEST_INACTIVE_EMAIL");
const inactivePassword = required("BCI_TEST_INACTIVE_PASSWORD");
const ordinaryEmail = required("BCI_TEST_ORDINARY_EMAIL");
const ordinaryPassword = required("BCI_TEST_ORDINARY_PASSWORD");
const sessionRevalidationEmail = required(
  "BCI_TEST_SESSION_REVALIDATION_EMAIL",
);
const sessionRevalidationPassword = required(
  "BCI_TEST_SESSION_REVALIDATION_PASSWORD",
);

type Json = Record<string, unknown>;
const post = async (
  fn: string,
  body: Json,
  token?: string,
  requestOrigin = origin,
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${base}/${fn}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${token ?? anonKey}`,
        "content-type": "application/json",
        origin: requestOrigin,
      },
      body: JSON.stringify(body),
    });
    let json: Json = {};
    try {
      json = await response.json();
    } catch { /* status is still asserted */ }
    return {
      status: response.status,
      json,
      origin: response.headers.get("access-control-allow-origin"),
    };
  } finally {
    clearTimeout(timer);
  }
};
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const login = async (email: string, password: string) =>
  post("admin-login", { email, password });
const sessionToken = (result: Awaited<ReturnType<typeof post>>) => {
  const session = result.json.session as Json | undefined;
  const token = session?.access_token;
  assert(
    typeof token === "string" && token.length > 0,
    "Expected a disposable session",
  );
  return token as string;
};
const authToken = async (email: string, password: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      "http://127.0.0.1:54321/auth/v1/token?grant_type=password",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${anonKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
    );
    const body = await response.json() as Json;
    assert(
      response.status === 200 && typeof body.access_token === "string",
      "Disposable Auth sign-in failed",
    );
    return body.access_token as string;
  } finally {
    clearTimeout(timer);
  }
};

const sessionAuthorization = async (
  token?: string,
  includeAuthorization = true,
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const headers: Record<string, string> = {
      apikey: anonKey,
      "content-type": "application/json",
      origin,
    };
    if (includeAuthorization) headers.authorization = `Bearer ${token ?? ""}`;
    const response = await fetch(`${base}/admin-session-authorization`, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: "{}",
    });
    let body: Json = {};
    try {
      body = await response.json() as Json;
    } catch { /* status and exact success body are asserted */ }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
};

const tokenSubject = (token: string) => {
  const encoded = token.split(".")[1] ?? "";
  const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/")
    .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  let subject = "";
  try {
    subject = String((JSON.parse(atob(normalized)) as Json).sub ?? "");
  } catch { /* rejected below without displaying token material */ }
  if (!/^[0-9a-f-]{36}$/i.test(subject)) {
    throw new Error("Disposable session subject is malformed");
  }
  return subject;
};

const serviceHeaders = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  "content-type": "application/json",
};
const serviceFetch = async (url: string, init: RequestInit = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};
const deleteMapping = async (userId: string) => {
  const response = await serviceFetch(
    `http://127.0.0.1:54321/rest/v1/users?user_id=eq.${
      encodeURIComponent(userId)
    }`,
    { method: "DELETE", headers: serviceHeaders },
  );
  assert(response.ok, "Disposable identity mapping deletion failed");
};
const insertMapping = async (
  userId: string,
  role: "Admin",
  status: "Active" | "Inactive",
) => {
  const response = await serviceFetch("http://127.0.0.1:54321/rest/v1/users", {
    method: "POST",
    headers: { ...serviceHeaders, prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, role, status }),
  });
  assert(response.ok, "Disposable identity mapping insertion failed");
};
const mappingIsRestored = async (userId: string) => {
  const response = await serviceFetch(
    `http://127.0.0.1:54321/rest/v1/users?select=user_id,role,status&user_id=eq.${
      encodeURIComponent(userId)
    }`,
    { headers: serviceHeaders },
  );
  if (!response.ok) return false;
  const rows = await response.json() as Json[];
  return rows.length === 1 && rows[0].user_id === userId &&
    rows[0].role === "Admin" && rows[0].status === "Active";
};

Deno.test({
  name:
    "CORS is pinned to APP_ORIGIN and rejects protected cross-origin demo requests",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const preflight = await fetch(`${base}/seed-demo-data`, {
      method: "OPTIONS",
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, origin },
    });
    assert(
      preflight.headers.get("access-control-allow-origin") === origin,
      "APP_ORIGIN CORS header mismatch",
    );
    const rejected = await post(
      "seed-demo-data",
      {},
      undefined,
      "http://127.0.0.1:3999",
    );
    assert(rejected.status === 403, "Cross-origin seed was not rejected");
  },
});

Deno.test("admin login is generic for malformed, inactive, ordinary, and invalid credentials", async () => {
  const cases = [
    await post("admin-login", { email: "", password: "" }),
    await login(inactiveEmail, inactivePassword),
    await login(ordinaryEmail, ordinaryPassword),
    await login(adminEmail, `${adminPassword}-invalid`),
  ];
  for (const result of cases) {
    assert(
      [400, 401, 429].includes(result.status),
      "Unexpected generic login status",
    );
    assert(
      result.json.message === "Unable to sign in.",
      "Login response disclosed eligibility",
    );
    assert(!("session" in result.json), "Rejected login returned a session");
  }
});

Deno.test("admin session authorization revalidates active authoritative identity and normalizes its response", async () => {
  const admin = await authToken(adminEmail, adminPassword);
  const active = await sessionAuthorization(admin);
  assert(active.status === 200, "Active Admin session was rejected");
  assert(
    JSON.stringify(active.body) ===
      JSON.stringify({
        verified_identity: { role: "Admin", status: "Active" },
      }),
    "Verified Admin identity was not exactly normalized",
  );

  const ordinary = await authToken(ordinaryEmail, ordinaryPassword);
  assert(
    (await sessionAuthorization(ordinary)).status === 403,
    "Ordinary session was authorized",
  );
  const inactive = await authToken(inactiveEmail, inactivePassword);
  assert(
    (await sessionAuthorization(inactive)).status === 403,
    "Inactive session was authorized",
  );
  assert(
    (await sessionAuthorization(undefined, false)).status === 401,
    "Missing bearer session was accepted",
  );
  assert(
    (await sessionAuthorization("invalid-disposable-token")).status === 401,
    "Invalid bearer session was accepted",
  );

  const revalidationToken = await authToken(
    sessionRevalidationEmail,
    sessionRevalidationPassword,
  );
  const userId = tokenSubject(revalidationToken);
  try {
    await deleteMapping(userId);
    await insertMapping(userId, "Admin", "Inactive");
    assert(
      (await sessionAuthorization(revalidationToken)).status === 403,
      "Previously issued session ignored inactive authoritative mapping",
    );
  } finally {
    await deleteMapping(userId);
    await insertMapping(userId, "Admin", "Active");
  }
  assert(
    await mappingIsRestored(userId),
    "Session-revalidation mapping restoration failed",
  );
});

Deno.test("three serialized failed Admin logins lock and a successful login resets prior failures", async () => {
  // Fixture bootstrap supplies a fresh Admin identity for this stateful case.
  const email = required("BCI_TEST_LOCK_ADMIN_EMAIL");
  const password = required("BCI_TEST_LOCK_ADMIN_PASSWORD");
  const first = await login(email, `${password}-invalid-1`);
  const second = await login(email, `${password}-invalid-2`);
  const third = await login(email, `${password}-invalid-3`);
  assert(
    first.status === 401 && second.status === 401 && third.status === 429,
    "Three-failure lock threshold mismatch",
  );
  const locked = await login(email, password);
  assert(
    locked.status === 429 && !("session" in locked.json),
    "Locked identity authenticated",
  );

  // A second fresh fixture proves success clears an earlier failure without
  // waiting for or modifying the one-hour lock.
  const resetEmail = required("BCI_TEST_RESET_ADMIN_EMAIL");
  const resetPassword = required("BCI_TEST_RESET_ADMIN_PASSWORD");
  assert(
    (await login(resetEmail, `${resetPassword}-invalid`)).status === 401,
    "Failure fixture was not recorded",
  );
  assert(
    (await login(resetEmail, resetPassword)).status === 200,
    "Valid Admin login failed",
  );
  assert(
    (await login(resetEmail, `${resetPassword}-invalid-again`)).status === 401,
    "Successful login did not reset failure count",
  );
});

Deno.test("password-reset request stays generic for eligible and unknown identities", async () => {
  const eligible = await post("admin-password-reset-request", {
    email: adminEmail,
  });
  const unknown = await post("admin-password-reset-request", {
    email: `unknown-${crypto.randomUUID()}@bci.invalid`,
  });
  assert(
    eligible.status === 200 && unknown.status === 200,
    "Reset endpoint status disclosed eligibility",
  );
  assert(
    JSON.stringify(eligible.json) === JSON.stringify(unknown.json) &&
      eligible.json.accepted === true,
    "Reset responses differ",
  );
});

Deno.test("blood request validates, accepts once, rejects replay, and temporarily blocks repeated invalid input", async () => {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 6);
  const valid = {
    patient_name: `Patient ${suffix}`,
    blood_group: "O+",
    hospital: "Disposable Hospital",
    mobile: `9${suffix.padEnd(9, "1")}`.slice(0, 10),
    address: "Local integration address",
  };
  assert(
    (await post("submit-blood-request", valid)).status === 200,
    "Valid blood request was rejected",
  );
  assert(
    (await post("submit-blood-request", valid)).status === 409,
    "Equivalent request replay was accepted",
  );
  const invalid = {
    ...valid,
    patient_name: "",
    mobile: `8${suffix.padEnd(9, "2")}`.slice(0, 10),
  };
  const statuses = [];
  for (let index = 0; index < 3; index++) {
    statuses.push((await post("submit-blood-request", invalid)).status);
  }
  assert(
    statuses.join(",") === "400,400,429",
    "Invalid-pattern blocking threshold mismatch",
  );
  assert(
    (await post("submit-blood-request", { ...valid, mobile: invalid.mobile }))
      .status === 429,
    "Blocked subject accepted a valid request",
  );
});

Deno.test("restore requires authentication, active permission, and honors explicit deny", async () => {
  const subjectHash = required("BCI_TEST_BLOCKED_SUBJECT_HASH");
  const payload = {
    subject_hash: subjectHash,
    reason: "Disposable integration restore",
  };
  assert(
    (await post("restore-blood-request-submission", payload)).status === 403,
    "Anonymous restore was accepted",
  );
  const ordinary = await authToken(ordinaryEmail, ordinaryPassword);
  assert(
    (await post("restore-blood-request-submission", payload, ordinary))
      .status === 403,
    "Ordinary restore was accepted",
  );
  const denied = sessionToken(
    await login(
      required("BCI_TEST_DENIED_ADMIN_EMAIL"),
      required("BCI_TEST_DENIED_ADMIN_PASSWORD"),
    ),
  );
  assert(
    (await post("restore-blood-request-submission", payload, denied)).status ===
      403,
    "Explicit deny did not win",
  );
  const admin = sessionToken(await login(adminEmail, adminPassword));
  assert(
    (await post("restore-blood-request-submission", payload, admin)).status ===
      200,
    "Authorized restore failed",
  );
});

Deno.test("demo seed/reset validate requests and enforce authentication, permission, deny, and replay", async () => {
  const requestId = crypto.randomUUID();
  const seed = {
    request_id: requestId,
    label: "Disposable integration",
    reason: "Local integration case",
    users: [],
    blood_requests: [{
      patient_name: "Demo Patient",
      blood_group: "A+",
      hospital: "Demo Hospital",
      mobile: "9876543210",
      address: "Demo local address",
    }],
  };
  assert(
    (await post("seed-demo-data", seed)).status === 403,
    "Anonymous seed was accepted",
  );
  assert(
    (await post(
      "seed-demo-data",
      { ...seed, request_id: "invalid" },
      sessionToken(await login(adminEmail, adminPassword)),
    )).status === 400,
    "Invalid seed request was accepted",
  );
  const denied = sessionToken(
    await login(
      required("BCI_TEST_DENIED_ADMIN_EMAIL"),
      required("BCI_TEST_DENIED_ADMIN_PASSWORD"),
    ),
  );
  assert(
    (await post("seed-demo-data", seed, denied)).status === 403,
    "Explicitly denied seed was accepted",
  );
  const admin = sessionToken(await login(adminEmail, adminPassword));
  assert(
    (await post("seed-demo-data", seed, admin)).status === 200,
    "Authorized seed failed",
  );
  assert(
    (await post("seed-demo-data", seed, admin)).status === 409,
    "Seed request ID replay was accepted",
  );
  const reset = {
    request_id: crypto.randomUUID(),
    confirmation_phrase: "RESET DEMO DATA",
    target_demo_batch_id: null,
    reason: "Disposable integration reset",
  };
  assert(
    (await post(
      "reset-demo-data",
      { ...reset, confirmation_phrase: "wrong" },
      admin,
    )).status === 400,
    "Invalid reset confirmation was accepted",
  );
  assert(
    (await post("reset-demo-data", reset, denied)).status === 403,
    "Explicitly denied reset was accepted",
  );
});

// Audit row contents require an owner-only database assertion. That assertion is
// intentionally kept in the SQL/concurrency phase because this HTTP test has no
// database network permission and private audit tables have no browser grant.
