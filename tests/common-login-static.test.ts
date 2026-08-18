const root = new URL("../", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));
const home = await read("index.html");
const login = await read("pages/login.html");
const loginClient = await read("js/common-login.js");
const authClient = await read("js/auth.js");
const adminShell = await read("js/admin-shell.js");
const loginFunction = await read("supabase/functions/admin-login/index.ts");
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
