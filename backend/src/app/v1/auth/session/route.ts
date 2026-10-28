import { z } from "zod";
import { issueSession, requireUser, revokeRefreshToken } from "@/lib/auth-user";
import { db } from "@/lib/db";
import { handle, ok, parseBody } from "@/lib/http";
import { shopify } from "@/lib/shopify";
import { isValidZone } from "@/lib/tz";
import { upsertUserFromShopify } from "@/lib/users";
import { ApiError, forbidden } from "@/lib/errors";

const schema = z.object({
  shopify_access_token: z.string().min(10),
  timezone: z.string().refine(isValidZone, "Zona horaria inválida").optional(),
  data_consent: z.boolean().optional(),
});

/** Inicia sesión con el token de la Customer Account API de Shopify. */
export const POST = handle(async (req) => {
  const body = await parseBody(req, schema);
  const customer = await shopify.getCustomer(body.shopify_access_token);
  const user = await upsertUserFromShopify(customer, { consent: body.data_consent, timezone: body.timezone });
  if (user.status !== "active") throw forbidden("account_blocked", "Tu cuenta no está activa");
  const consent = await db.one<{ data_consent_at: Date | null }>("select data_consent_at from users where id = $1", [user.id]);
  return ok({ ...(await issueSession(user.id)), user_id: user.id, needs_data_consent: !consent?.data_consent_at });
});

export const DELETE = handle(async (req) => {
  await requireUser(req);
  const refresh = req.headers.get("x-refresh-token");
  if (!refresh) throw new ApiError(400, "missing_refresh_token", "Falta el encabezado X-Refresh-Token");
  await revokeRefreshToken(refresh);
  return new Response(null, { status: 204 });
});
