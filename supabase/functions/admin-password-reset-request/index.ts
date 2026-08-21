import {
  productionCorsReply,
  productionOriginAllowed,
  productionPreflight,
} from "../_shared/cors.ts";

type SecurityDependencies = typeof import("../_shared/security.ts");
type SecurityLoader = () => Promise<SecurityDependencies>;

const generic = { accepted: true };
const loadSecurity: SecurityLoader = () => import("../_shared/security.ts");

export async function handleAdminPasswordResetRequest(
  request: Request,
  securityLoader: SecurityLoader = loadSecurity,
) {
  if (request.method === "OPTIONS") return productionPreflight(request);
  if (!productionOriginAllowed(request)) return productionCorsReply(request, generic, 403);
  if (request.method !== "POST") return productionCorsReply(request, generic, 405);
  try {
    const { serviceAuth, sql } = await securityLoader();
    const { email } = await request.json();
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
    const eligible = normalized && await sql`select 1 from auth.users a join public.users u on u.user_id=a.id::text where lower(a.email)=${normalized} and lower(u.role)='admin' and lower(u.status)='active' limit 1`;
    if (eligible?.length) {
      await serviceAuth.auth.resetPasswordForEmail(normalized, {
        redirectTo: "https://bloodconnectindia.org/pages/admin-reset-password.html",
      });
    }
    await sql`insert into security.authorization_audit_log (event_type, reason) values ('admin_password_reset_requested', 'generic reset request')`;
    return productionCorsReply(request, generic);
  } catch {
    return productionCorsReply(request, generic);
  }
}

if (import.meta.main) Deno.serve((request) => handleAdminPasswordResetRequest(request));
