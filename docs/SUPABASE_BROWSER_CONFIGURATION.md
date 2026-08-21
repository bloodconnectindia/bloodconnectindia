# Supabase browser configuration

BloodConnectIndia does not contain a default Supabase project URL or key. Every
page that needs Supabase must receive an explicit runtime configuration before
`js/supabase.js` runs:

```html
<script>
window.__BLOODCONNECT_SUPABASE_CONFIG__ = {
  environment: "local",
  url: "http://127.0.0.1:54321",
  publishableKey: "<browser-safe-publishable-key>"
};
</script>
```

Inject this object through the environment's hosting/build configuration. Do not
commit real environment values to the repository. `js/supabase-config.js`
validates the object, and `js/supabase.js` creates the client only after validation.
Missing or invalid configuration throws before a Supabase client exists.

## Environments

| Environment | Page and target requirements |
|---|---|
| `local` | Both the page hostname and Supabase URL must be loopback (`localhost`, `127.0.0.1`, or `::1`). |
| `dev` | Explicit development values are required. A page running on loopback may target only loopback. |
| `test` | Explicit test values are required. A page running on loopback may target only loopback. |
| `preview` | Explicit preview values are required. Hosted targets must use HTTPS. A loopback page cannot target them. |
| `production` | Explicit production values are required. Both page and target must be non-loopback, and the target must use HTTPS. |

There is no environment inference and no fallback from one environment to
another. In particular, localhost never inherits preview or production values.

## Credential boundary

Only Supabase `sb_publishable_...` keys and unexpired, structurally valid legacy
HS256 JWTs whose issuer is `supabase` and decoded role is `anon` are accepted.
The Supabase service still verifies the JWT signature. Service-role keys,
`sb_secret_...` keys, server secrets,
database URLs, and credentials embedded in URLs are rejected. Browser keys are
not authorization by themselves; RLS and server-side authorization remain
mandatory.

Production values must be supplied by the production hosting configuration.
Preview, development, and test deployments must use their own explicit projects
or approved local targets. Never reuse production configuration for local work.

## GitHub Pages artifact generation

The Pages workflow reads only the public GitHub Actions variables
`BCI_SUPABASE_URL` and `BCI_SUPABASE_PUBLISHABLE_KEY`. The deterministic builder
validates both values and writes `js/supabase-runtime-config.js` only inside the
generated `_site` deployment artifact. A production-value runtime file must not
be committed to the repository.

For every HTML page that initializes `js/supabase.js`, the artifact builder
inserts the generated script after `js/supabase-config.js` and before
`js/supabase.js`. Missing, malformed, loopback, non-HTTPS, credential-bearing,
or secret-like configuration stops the build before artifact upload or deploy.

Repository administrators must explicitly configure GitHub Pages to use GitHub
Actions and define the two public variables before enabling the workflow. The
workflow does not require or accept a service-role key, database credential,
Supabase access token, JWT signing secret, or administrator credential.
