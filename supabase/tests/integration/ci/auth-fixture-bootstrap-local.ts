// Future runner-local fixture bootstrap. This file is not invoked by static
// validation. It accepts only the disposable loopback API and an ephemeral
// local service-role credential supplied through the runner environment.
const localApi = Deno.env.get("BCI_LOCAL_SUPABASE_URL");
if (localApi !== "http://127.0.0.1:54321") {
  throw new Error("Disposable Auth bootstrap rejected a non-loopback endpoint");
}
const serviceKey = Deno.env.get("BCI_LOCAL_SERVICE_ROLE_KEY");
if (!serviceKey) {
  throw new Error("Disposable local service credential is missing");
}
const runId = Deno.env.get("BCI_TEST_RUN_ID") ?? "";
if (!/^bci-local-[0-9]+-[0-9]+$/.test(runId)) {
  throw new Error("Disposable run ID rejected");
}
const runnerTemp = Deno.env.get("RUNNER_TEMP") ?? "";
const githubEnv = Deno.env.get("GITHUB_ENV") ?? "";
if (!runnerTemp || !githubEnv) {
  throw new Error("Ephemeral runner paths are missing");
}
const normalizedTemp = runnerTemp.replaceAll("\\", "/").replace(/\/$/, "");
const normalizedEnv = githubEnv.replaceAll("\\", "/");
if (!normalizedEnv.startsWith(`${normalizedTemp}/`)) {
  throw new Error("Fixture environment file is outside RUNNER_TEMP");
}
const manifestPath = `${normalizedTemp}/bci-auth-fixtures-${runId}.json`;

type Fixture = {
  label: string;
  email: string;
  role: string;
  status: "Active" | "Inactive";
  category: string;
  app_metadata?: Record<string, unknown>;
  passwordEnv: string;
  emailEnv: string;
};
type SafeFixture = Pick<Fixture, "label" | "role" | "status" | "category"> & {
  user_id: string;
};

const fixtures: Fixture[] = [
  {
    label: "ordinary-active",
    email: "runner-ordinary@bci.invalid",
    role: "User",
    status: "Active",
    category: "ordinary",
    passwordEnv: "BCI_TEST_ORDINARY_PASSWORD",
    emailEnv: "BCI_TEST_ORDINARY_EMAIL",
  },
  {
    label: "inactive-user",
    email: "runner-inactive@bci.invalid",
    role: "User",
    status: "Inactive",
    category: "inactive",
    passwordEnv: "BCI_TEST_INACTIVE_PASSWORD",
    emailEnv: "BCI_TEST_INACTIVE_EMAIL",
  },
  {
    label: "admin",
    email: "runner-admin@bci.invalid",
    role: "Admin",
    status: "Active",
    category: "admin",
    passwordEnv: "BCI_TEST_ADMIN_PASSWORD",
    emailEnv: "BCI_TEST_ADMIN_EMAIL",
  },
  {
    label: "session-revalidation-admin",
    email: "runner-session-revalidation@bci.invalid",
    role: "Admin",
    status: "Active",
    category: "session-revalidation",
    passwordEnv: "BCI_TEST_SESSION_REVALIDATION_PASSWORD",
    emailEnv: "BCI_TEST_SESSION_REVALIDATION_EMAIL",
  },
  {
    label: "future-super-admin",
    email: "runner-super-admin@bci.invalid",
    role: "Super Admin",
    status: "Active",
    category: "super-admin",
    passwordEnv: "BCI_TEST_SUPER_ADMIN_PASSWORD",
    emailEnv: "BCI_TEST_SUPER_ADMIN_EMAIL",
  },
  {
    label: "explicitly-denied-admin",
    email: "runner-denied-admin@bci.invalid",
    role: "Admin",
    status: "Active",
    category: "explicit-deny",
    passwordEnv: "BCI_TEST_DENIED_ADMIN_PASSWORD",
    emailEnv: "BCI_TEST_DENIED_ADMIN_EMAIL",
  },
  {
    label: "demo-only",
    email: "runner-demo@bci.invalid",
    role: "User",
    status: "Active",
    category: "demo",
    app_metadata: { is_demo: true, fixture: "valid" },
    passwordEnv: "BCI_TEST_DEMO_PASSWORD",
    emailEnv: "BCI_TEST_DEMO_EMAIL",
  },
  {
    label: "malformed-demo",
    email: "runner-malformed-demo@bci.invalid",
    role: "User",
    status: "Active",
    category: "malformed-demo",
    app_metadata: { is_demo: true, demo_batch_id: "mismatch" },
    passwordEnv: "BCI_TEST_MALFORMED_DEMO_PASSWORD",
    emailEnv: "BCI_TEST_MALFORMED_DEMO_EMAIL",
  },
  {
    label: "password-recovery-admin",
    email: "runner-recovery-admin@bci.invalid",
    role: "Admin",
    status: "Active",
    category: "recovery",
    passwordEnv: "BCI_TEST_RECOVERY_OLD_PASSWORD",
    emailEnv: "BCI_TEST_RECOVERY_ADMIN_EMAIL",
  },
  {
    label: "login-lock-admin",
    email: "runner-lock-admin@bci.invalid",
    role: "Admin",
    status: "Active",
    category: "login-lock",
    passwordEnv: "BCI_TEST_LOCK_ADMIN_PASSWORD",
    emailEnv: "BCI_TEST_LOCK_ADMIN_EMAIL",
  },
  {
    label: "login-reset-admin",
    email: "runner-reset-admin@bci.invalid",
    role: "Admin",
    status: "Active",
    category: "login-reset",
    passwordEnv: "BCI_TEST_RESET_ADMIN_PASSWORD",
    emailEnv: "BCI_TEST_RESET_ADMIN_EMAIL",
  },
  {
    label: "concurrent-lock-admin",
    email: "runner-concurrent-lock@bci.invalid",
    role: "Admin",
    status: "Active",
    category: "concurrent-login",
    passwordEnv: "BCI_TEST_CONCURRENT_LOCK_PASSWORD",
    emailEnv: "BCI_TEST_CONCURRENT_LOCK_EMAIL",
  },
  {
    label: "second-admin",
    email: "runner-second-admin@bci.invalid",
    role: "Admin",
    status: "Active",
    category: "concurrency",
    passwordEnv: "BCI_TEST_SECOND_ADMIN_PASSWORD",
    emailEnv: "BCI_TEST_SECOND_ADMIN_EMAIL",
  },
];

const password = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const random = Array.from(
    bytes,
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
  return `${random}aA1!`;
};
const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  "content-type": "application/json",
};
const timedFetch = async (url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};
const deleteFixture = async (userId: string) => {
  await timedFetch(
    `${localApi}/rest/v1/users?user_id=eq.${encodeURIComponent(userId)}`,
    { method: "DELETE", headers },
  );
  await timedFetch(
    `${localApi}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { method: "DELETE", headers },
  );
};

if (Deno.args[0] === "--cleanup") {
  const safe = JSON.parse(
    await Deno.readTextFile(manifestPath),
  ) as SafeFixture[];
  for (const fixture of safe) await deleteFixture(fixture.user_id);
  await Deno.remove(manifestPath);
} else if (Deno.args.length === 0) {
  const safe: SafeFixture[] = [];
  const secrets: string[] = [];
  try {
    for (const fixture of fixtures) {
      const generatedPassword = password();
      const response = await timedFetch(`${localApi}/auth/v1/admin/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: fixture.email,
          password: generatedPassword,
          email_confirm: true,
          app_metadata: fixture.app_metadata ?? {},
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Disposable Auth creation failed for fixture ${fixture.label}`,
        );
      }
      const created = await response.json() as { id?: string };
      if (!created.id || !/^[0-9a-f-]{36}$/i.test(created.id)) {
        throw new Error(
          `Disposable Auth response rejected for fixture ${fixture.label}`,
        );
      }
      const mapped = await timedFetch(`${localApi}/rest/v1/users`, {
        method: "POST",
        headers: { ...headers, prefer: "return=minimal" },
        body: JSON.stringify({
          user_id: created.id,
          role: fixture.role,
          status: fixture.status,
        }),
      });
      if (!mapped.ok) {
        await deleteFixture(created.id);
        throw new Error(
          `Disposable public identity mapping failed for fixture ${fixture.label}`,
        );
      }
      safe.push({
        user_id: created.id,
        label: fixture.label,
        role: fixture.role,
        status: fixture.status,
        category: fixture.category,
      });
      secrets.push(
        `${fixture.emailEnv}=${fixture.email}`,
        `${fixture.passwordEnv}=${generatedPassword}`,
      );
      if (fixture.category === "recovery") {
        secrets.push(`BCI_TEST_RECOVERY_NEW_PASSWORD=${password()}`);
      }
    }
    await Deno.writeTextFile(
      manifestPath,
      `${JSON.stringify(safe, null, 2)}\n`,
      { createNew: true, mode: 0o600 },
    );
    await Deno.writeTextFile(githubEnv, `${secrets.join("\n")}\n`, {
      append: true,
    });
  } catch (error) {
    for (const fixture of safe.reverse()) {
      try {
        await deleteFixture(fixture.user_id);
      } catch { /* ephemeral stack teardown remains authoritative */ }
    }
    throw error;
  }
} else {
  throw new Error("Unknown disposable Auth bootstrap mode");
}
