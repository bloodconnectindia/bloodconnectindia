const api = "http://127.0.0.1:54321";
const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing disposable input: ${name}`);
  return value;
};
const key = required("BCI_LOCAL_ANON_KEY");
type Json = Record<string, unknown>;
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
const request = async (path: string, body: Json, token = key) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${api}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        apikey: key,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        origin: "http://127.0.0.1:3000",
      },
      body: JSON.stringify(body),
    });
    let json: Json = {};
    try {
      json = await response.json();
    } catch { /* status-only */ }
    return { status: response.status, json };
  } finally {
    clearTimeout(timer);
  }
};
const login = async (email: string, password: string) =>
  request("/functions/v1/admin-login", { email, password });
const token = (result: Awaited<ReturnType<typeof request>>) => {
  const value = (result.json.session as Json | undefined)?.access_token;
  assert(
    result.status === 200 && typeof value === "string",
    "Admin fixture login failed",
  );
  return value as string;
};
const statuses = (results: Awaited<ReturnType<typeof request>>[]) =>
  results.map((result) => result.status).sort((a, b) => a - b);

Deno.test("concurrent Admin failures serialize at the lock threshold", async () => {
  const email = required("BCI_TEST_CONCURRENT_LOCK_EMAIL");
  const password = required("BCI_TEST_CONCURRENT_LOCK_PASSWORD");
  const results = await Promise.all(
    [1, 2, 3].map((index) => login(email, `${password}-invalid-${index}`)),
  );
  assert(
    JSON.stringify(statuses(results)) === JSON.stringify([401, 401, 429]),
    "Concurrent login failures were not serialized exactly",
  );
  assert(
    (await login(email, password)).status === 429,
    "Lock did not survive concurrent failures",
  );
});

Deno.test("same blood request replay and concurrent duplicate commit exactly once", async () => {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const payload = {
    patient_name: `Concurrent ${suffix}`,
    blood_group: "B+",
    hospital: "Runner Local Hospital",
    mobile: `9${suffix.replace(/[^0-9]/g, "7").padEnd(9, "7")}`.slice(0, 10),
    address: "Runner local integration address",
  };
  const pair = await Promise.all([
    request("/functions/v1/submit-blood-request", payload),
    request("/functions/v1/submit-blood-request", payload),
  ]);
  assert(
    JSON.stringify(statuses(pair)) === JSON.stringify([200, 409]),
    "Concurrent duplicate was not exactly-once",
  );
  assert(
    (await request("/functions/v1/submit-blood-request", payload)).status ===
      409,
    "Committed request replay was not rejected",
  );
});

Deno.test("same seed request ID has one owner and replay ownership cannot transfer", async () => {
  const first = token(
    await login(
      required("BCI_TEST_ADMIN_EMAIL"),
      required("BCI_TEST_ADMIN_PASSWORD"),
    ),
  );
  const second = token(
    await login(
      required("BCI_TEST_SECOND_ADMIN_EMAIL"),
      required("BCI_TEST_SECOND_ADMIN_PASSWORD"),
    ),
  );
  const requestId = crypto.randomUUID();
  const payload = {
    request_id: requestId,
    label: "Concurrent seed",
    reason: "Concurrency ownership assertion",
    users: [],
    blood_requests: [{
      patient_name: "Seed Patient",
      blood_group: "AB+",
      hospital: "Runner Hospital",
      mobile: "9876543211",
      address: "Runner local seed address",
    }],
  };
  const pair = await Promise.all([
    request("/functions/v1/seed-demo-data", payload, first),
    request("/functions/v1/seed-demo-data", payload, second),
  ]);
  assert(
    JSON.stringify(statuses(pair)) === JSON.stringify([200, 409]),
    "Seed request ID did not have exactly one owner",
  );
  assert(
    (await request("/functions/v1/seed-demo-data", payload, second)).status ===
      409,
    "Seed replay ownership transferred",
  );
});

Deno.test("concurrent reset of one prepared batch/request commits once", async () => {
  const first = token(
    await login(
      required("BCI_TEST_ADMIN_EMAIL"),
      required("BCI_TEST_ADMIN_PASSWORD"),
    ),
  );
  const second = token(
    await login(
      required("BCI_TEST_SECOND_ADMIN_EMAIL"),
      required("BCI_TEST_SECOND_ADMIN_PASSWORD"),
    ),
  );
  const batch = required("BCI_TEST_RESET_BATCH_ID");
  const payload = {
    request_id: crypto.randomUUID(),
    confirmation_phrase: "RESET DEMO DATA",
    target_demo_batch_id: batch,
    reason: "Concurrent reset assertion",
  };
  const pair = await Promise.all([
    request("/functions/v1/reset-demo-data", payload, first),
    request("/functions/v1/reset-demo-data", payload, second),
  ]);
  assert(
    JSON.stringify(statuses(pair)) === JSON.stringify([200, 409]),
    "Reset request ID did not commit exactly once",
  );
  assert(
    (await request("/functions/v1/reset-demo-data", payload, second)).status ===
      409,
    "Reset replay ownership transferred",
  );
});

// Advisory/row-lock implementation presence is statically pinned by the Edge
// Function security unit tests; these observable races prove the locks produce
// the required exactly-once result without exposing the private database.
