import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ok } from "@/lib/http";
import { finalizeRedemption } from "@/lib/redemptions";

/** Reintenta crear el código en Shopify para un canje pendiente. */
export const POST = adminHandle<{ id: string }>("redemptions.manage", async (_req, { id }, a) => {
  const out = await finalizeRedemption(id);
  await audit(db, a.admin.id, "redemption.retry", "redemption", id, null, { ok: out.ok });
  return ok({ ok: out.ok, ...(out.ok ? {} : { error: out.error }) });
});
