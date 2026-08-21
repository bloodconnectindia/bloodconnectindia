const root = new URL("../", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));
const home = await read("index.html");
const login = await read("pages/login.html");
const loginClient = await read("js/common-login.js");
const authClient = await read("js/auth.js");
const forgot = await read("pages/admin-forgot-password.html");
const forgotClient = await read("js/admin-forgot-password.js");
const reset = await read("pages/admin-reset-password.html");
const resetClient = await read("js/admin-reset-password.js");
const supabaseClient = await read("js/supabase.js");
const authStyles = await read("css/auth.css");
const adminShell = await read("js/admin-shell.js");
const loginFunction = await read("supabase/functions/admin-login/index.ts");
const resetRequestFunction = await read("supabase/functions/admin-password-reset-request/index.ts");
const sessionFunction = await read("supabase/functions/admin-session-authorization/index.ts");
const design = await read("docs/COMMON_LOGIN_AND_ROLE_ROUTING.md");

Deno.test("homepage exposes exactly the finalized public actions", () => {
  if (!home.includes("Connecting Donors. Saving Lives.")) throw new Error("Finalized branding is missing");
  const actions = [...home.matchAll(/<a class="button" href="([^"]+)">([^<]+)<\/a>/g)]
    .map((match) => ({ href: match[1], label: match[2] }));
  const expected = [
    { href: "pages/blood-request.html", label: "Blood Request" },
    { href: "css/js/pages/donor-registration.html", label: "Donor Registration" },
    { href: "pages/login.html", label: "Login" },
  ];
  if (JSON.stringify(actions) !== JSON.stringify(expected)) throw new Error("Homepage actions differ from the finalized set");
  for (const forbidden of ["Admin Login", "Hospital Login", "Blood Bank Login", "Central Login", "State Login", "District Login", "National Intelligent Blood Network"]) {
    if (home.includes(forbidden)) throw new Error(`Homepage still exposes ${forbidden}`);
  }
});

Deno.test("common login accepts only email and password with no browser role source", () => {
  const inputs = [...login.matchAll(/<input\b[^>]*name="([^"]+)"[^>]*>/g)].map((match) => match[1]);
  if (JSON.stringify(inputs) !== JSON.stringify(["email", "password"])) throw new Error("Common login fields are not exactly email and password");
  if (/<select\b/i.test(login) || /name="role"/i.test(login)) throw new Error("Common login exposes a role selector");
  const combined = `${login}\n${loginClient}`;
  for (const forbidden of ["localStorage", "sessionStorage", "URLSearchParams", "location.search", "location.pathname", "querySelector('[name=role]", "getElementById(\"role\""]) {
    if (combined.includes(forbidden)) throw new Error(`Browser role source is present: ${forbidden}`);
  }
});

Deno.test("routing accepts only trusted active Admin verification and fails closed", () => {
  for (const required of [
    'identity?.role === "Admin"', 'identity?.status === "Active"',
    'return "admin-dashboard.html"', "does not have a verified supported destination",
  ]) if (!authClient.includes(required)) throw new Error(`Trusted route requirement missing: ${required}`);
  if (!loginFunction.includes("lower(role)='admin'") || !loginFunction.includes("lower(status)='active'")) {
    throw new Error("Login endpoint does not verify authoritative active Admin status");
  }
  if (!loginFunction.includes("verified_identity: { role: 'Admin', status: 'Active' }")) {
    throw new Error("Login endpoint does not return normalized verified identity");
  }
  if (!adminShell.includes("requireVerifiedAdminSession")) throw new Error("Admin shell does not revalidate authorization");
  for (const required of ["auth.auth.getUser", "public.users", "lower(role)='admin'", "lower(status)='active'"]) {
    if (!sessionFunction.includes(required)) throw new Error(`Session authorization is missing ${required}`);
  }
});

Deno.test("auth code uses the explicitly initialized Supabase browser client", () => {
  if (!supabaseClient.includes("window.supabaseClient = window.supabase.createClient")) {
    throw new Error("Supabase client is not initialized on the explicit browser boundary");
  }
  for (const [name, source] of [["auth", authClient], ["reset", resetClient]] as const) {
    if (!source.includes("window.supabaseClient")) throw new Error(`${name} does not use the explicit client`);
    if (/(^|[^.\w])supabaseClient\s*\./m.test(source)) throw new Error(`${name} contains a fragile bare supabaseClient reference`);
  }
});

Deno.test("missing Supabase runtime client fails closed with a controlled auth error", async () => {
  const fakeWindow: Record<string, unknown> = {};
  new Function("window", authClient)(fakeWindow);
  const auth = fakeWindow.BloodConnectAuth as { signIn(email: string, password: string): Promise<unknown> };
  try {
    await auth.signIn("invalid@example.invalid", "not-a-real-password");
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication service is unavailable. Please try again later.") return;
    throw error;
  }
  throw new Error("Missing Supabase client did not fail closed");
});

Deno.test("login runtime uses server-verified identity before establishing the session", async () => {
  const session = { access_token: "test-access", refresh_token: "test-refresh" };
  let response: Record<string, unknown> = { session, verified_identity: { role: "Admin", status: "Active" } };
  let invokeError: Error | null = null;
  let established = false;
  const fakeWindow = {
    supabaseClient: {
      functions: { invoke: async () => ({ data: response, error: invokeError }) },
      auth: { setSession: async () => { established = true; return { error: null }; } },
    },
  } as Record<string, unknown>;
  new Function("window", authClient)(fakeWindow);
  const auth = fakeWindow.BloodConnectAuth as { signIn(email: string, password: string): Promise<{ destination: string }> };
  const result = await auth.signIn("admin@example.invalid", "not-a-real-password");
  if (result.destination !== "admin-dashboard.html" || !established) throw new Error("Verified Admin login did not establish its routed session");

  established = false;
  invokeError = new Error("invalid credentials");
  let invalidRejected = false;
  try {
    await auth.signIn("admin@example.invalid", "invalid-password");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "Unable to sign in. Please try again." || established) throw error;
    invalidRejected = true;
  }
  if (!invalidRejected) throw new Error("Invalid credentials did not fail closed");

  invokeError = null;
  response = { session, verified_identity: { role: "Hospital", status: "Active" } };
  try {
    await auth.signIn("hospital@example.invalid", "not-a-real-password");
  } catch (error) {
    if (error instanceof Error && error.message.includes("verified supported destination") && !established) return;
    throw error;
  }
  throw new Error("Unsupported verified role did not fail closed before session establishment");
});

Deno.test("common auth pages use neutral branding before authentication", () => {
  for (const [name, html] of [["login", login], ["forgot", forgot], ["reset", reset]] as const) {
    for (const required of ["BloodConnectIndia", "Connecting Donors. Saving Lives."]) {
      if (!html.includes(required)) throw new Error(`${name} is missing ${required}`);
    }
    if (/ADMIN WORKSPACE|HOSPITAL WORKSPACE|BLOOD BANK WORKSPACE/i.test(html)) {
      throw new Error(`${name} exposes role-specific workspace branding`);
    }
  }
});

Deno.test("login password visibility control is accessible and does not handle password data", () => {
  for (const required of ['type="password"', 'data-password-toggle="login-password"', 'aria-label="Show password"', 'aria-pressed="false"']) {
    if (!login.includes(required)) throw new Error(`Login password toggle is missing ${required}`);
  }
  for (const required of ['password.type = show ? "text" : "password"', 'show ? "Hide password" : "Show password"']) {
    if (!loginClient.includes(required)) throw new Error(`Password toggle behavior is missing ${required}`);
  }
  for (const forbidden of ["console.", "localStorage", "sessionStorage", "fetch("]) {
    if (loginClient.includes(forbidden)) throw new Error(`Password UI contains forbidden handling: ${forbidden}`);
  }
});

Deno.test("forgot password copy is exact and enumeration resistance remains server-backed", () => {
  if (!forgot.includes("Enter your registered email address.")) throw new Error("Forgot password wording differs");
  if (forgot.includes("The response remains the same whether or not an eligible account exists.")) throw new Error("Removed explanatory copy remains visible");
  if (!forgotClient.includes("If an eligible account exists, a reset link will be sent.")) throw new Error("Generic client response is missing");
  for (const required of ["return reply({ accepted: true })", "catch { return reply({ accepted: true }) }"]) {
    if (!resetRequestFunction.includes(required)) throw new Error(`Server enumeration protection is missing ${required}`);
  }
});

Deno.test("auth UI includes responsive, focus, loading, error, and disabled structures", () => {
  for (const required of ["@media(max-width:480px)", ":focus-visible", ":disabled", ".auth-message[data-state=loading]", "width:min(100%,30rem)", "min-width:320px", "[hidden]{display:none!important}"]) {
    if (!authStyles.includes(required)) throw new Error(`Auth structural state is missing ${required}`);
  }
  if (!loginClient.includes("submit.disabled = true") || !loginClient.includes('message.dataset.state = "error"')) throw new Error("Login runtime states are incomplete");
});

Deno.test("frontend auth changes contain no privileged Supabase secret material", () => {
  const combined = [login, forgot, reset, loginClient, authClient, forgotClient, resetClient, authStyles].join("\n");
  for (const forbidden of ["service_role", "SUPABASE_SERVICE_ROLE", "sb_secret_", "admin credentials"]) {
    if (combined.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`Frontend contains privileged material marker: ${forbidden}`);
  }
});

Deno.test("legacy login pages route to common login without role input", async () => {
  for (const path of ["pages/admin-login.html", "css/js/pages/hospital-login.html", "css/js/pages/blood-bank-login.html"]) {
    const html = await read(path);
    if (!html.includes("pages/login.html") && !html.includes("url=login.html")) throw new Error(`${path} does not route to common login`);
    if (/<form\b/i.test(html) || /name="role"/i.test(html)) throw new Error(`${path} still accepts login or role input`);
  }
});

Deno.test("deferred workflows, monitor hierarchy, and one service rating remain documented", () => {
  for (const required of [
    "Pending Verification", "Admin Approval", "Activation",
    "exactly one Central Monitor nationwide", "one State Monitor per state",
    "one District Monitor per district", "never self-register", "geography-scoped",
    "Fulfilled", "Completed", "exactly one 1–5 star rating",
    "BloodConnectIndia Service Experience", "not a donor, hospital, or blood-bank rating",
  ]) if (!design.includes(required)) throw new Error(`Deferred requirement missing: ${required}`);
});

Deno.test("homepage and common login retain mobile viewport and responsive styling", () => {
  for (const [name, html] of [["homepage", home], ["common login", login]] as const) {
    if (!html.includes('name="viewport"')) throw new Error(`${name} lacks mobile viewport`);
  }
  if (!home.includes("@media(max-width:480px)")) throw new Error("Homepage mobile breakpoint is missing");
  if (!login.includes('../css/admin.css')) throw new Error("Common login does not use responsive auth styles");
});
