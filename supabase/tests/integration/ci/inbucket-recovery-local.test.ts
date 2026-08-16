const api = "http://127.0.0.1:54321";
const inbucket = "http://127.0.0.1:54324";
const origin = "http://127.0.0.1:3000";
const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing disposable recovery input: ${name}`);
  return value;
};
const key = required("BCI_LOCAL_ANON_KEY");
const email = required("BCI_TEST_RECOVERY_ADMIN_EMAIL");
const oldPassword = required("BCI_TEST_RECOVERY_OLD_PASSWORD");
const newPassword = required("BCI_TEST_RECOVERY_NEW_PASSWORD");
if (!email.endsWith("@bci.invalid")) {
  throw new Error("Recovery fixture must use the reserved fake domain");
}
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
type Json = Record<string, unknown>;

const timedFetch = async (
  input: string,
  init?: RequestInit,
  timeoutMs = 8_000,
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};
const resetRequest = async (target: string) => {
  const response = await timedFetch(
    `${api}/functions/v1/admin-password-reset-request`,
    {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        origin,
      },
      body: JSON.stringify({ email: target }),
    },
  );
  const body = await response.json() as Json;
  return { status: response.status, body };
};
const signIn = async (password: string) => {
  const response = await timedFetch(
    `${api}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  let body: Json = {};
  try {
    body = await response.json();
  } catch { /* status-only */ }
  return { status: response.status, body };
};
const mailboxMessages = async () => {
  const mailbox = encodeURIComponent(email.split("@")[0]);
  const response = await timedFetch(`${inbucket}/api/v1/mailbox/${mailbox}`);
  if (!response.ok) return [] as Json[];
  const body = await response.json() as Json | Json[];
  return Array.isArray(body)
    ? body
    : (Array.isArray(body.messages) ? body.messages as Json[] : []);
};
const messageBody = async (message: Json) => {
  const id = String(message.id ?? message.ID ?? "");
  assert(id, "InBucket message identifier missing");
  const mailbox = encodeURIComponent(email.split("@")[0]);
  const response = await timedFetch(
    `${inbucket}/api/v1/mailbox/${mailbox}/${encodeURIComponent(id)}`,
  );
  assert(response.ok, "InBucket message could not be read");
  const body = await response.json() as Json;
  const lowerBody = (body.body ?? {}) as Json;
  const upperBody = (body.Body ?? {}) as Json;
  return String(
    body.html ?? body.HTML ?? lowerBody.html ?? upperBody.HTML ?? body.text ??
      "",
  );
};

Deno.test({
  name: "local InBucket recovery completes without exposing recovery material",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const unknown = await resetRequest(
      `unknown-${crypto.randomUUID()}@bci.invalid`,
    );
    const eligible = await resetRequest(email);
    assert(
      unknown.status === 200 && eligible.status === 200,
      "Generic reset status mismatch",
    );
    assert(
      JSON.stringify(unknown.body) === JSON.stringify(eligible.body) &&
        eligible.body.accepted === true,
      "Reset response disclosed account existence",
    );

    let messages: Json[] = [];
    for (let attempt = 0; attempt < 20 && messages.length === 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      messages = await mailboxMessages();
    }
    assert(
      messages.length > 0,
      "Recovery email did not reach runner-local InBucket",
    );
    const html = await messageBody(messages[0]);
    const match = html.match(/https?:\/\/[^\s"'<>]+/);
    assert(match, "Recovery email did not contain a link");

    // The complete URL is held only in memory and is never interpolated into an
    // error or log. Validate the approved redirect path before following it.
    const recoveryUrl = new URL(match![0].replaceAll("&amp;", "&"));
    const redirectValue = recoveryUrl.searchParams.get("redirect_to") ??
      recoveryUrl.searchParams.get("redirectTo");
    assert(redirectValue !== null, "Recovery link lacks an approved redirect");
    const redirect = new URL(redirectValue!);
    assert(
      redirect.origin === origin &&
        redirect.pathname === "/pages/admin-reset-password.html",
      "Recovery redirect is not the Admin reset page",
    );

    const verification = await timedFetch(recoveryUrl.toString(), {
      redirect: "manual",
    });
    assert(
      [302, 303, 307].includes(verification.status),
      "Recovery verification did not redirect",
    );
    const location = verification.headers.get("location");
    assert(location, "Recovery verification redirect missing");
    const returned = new URL(location!, origin);
    assert(
      returned.origin === origin &&
        returned.pathname === "/pages/admin-reset-password.html",
      "Recovery session returned to an unapproved page",
    );
    const fragment = new URLSearchParams(returned.hash.replace(/^#/, ""));
    const accessToken = fragment.get("access_token");
    assert(accessToken, "Recovery session was not established");

    const update = await timedFetch(`${api}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: key,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: newPassword }),
    });
    assert(update.status === 200, "Recovery password update failed");
    assert(
      (await signIn(oldPassword)).status !== 200,
      "Old password still authenticated",
    );
    assert(
      (await signIn(newPassword)).status === 200,
      "New password did not authenticate",
    );

    // Eligibility remains separate from Auth recovery: the project endpoint must
    // still perform active-Admin authorization before returning a session.
    const adminLogin = await timedFetch(`${api}/functions/v1/admin-login`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        origin,
      },
      body: JSON.stringify({ email, password: newPassword }),
    });
    assert(
      adminLogin.status === 200,
      "Recovered Auth identity did not pass separately enforced Admin eligibility",
    );
  },
});
