import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ok } from "@/lib/http";

/** Cola de canjes con problemas: fallidos en Shopify o pendientes que no se completaron. */
export const GET = adminHandle("redemptions.view", async () => {
  const rows = await db.many(
    `select r.id, r.user_id, u.email as user_email, r.points, r.status, r.error, r.created_at, o.name as option_name
       from redemptions r join users u on u.id = r.user_id join redemption_options o on o.id = r.option_id
      where r.status = 'failed' or (r.status = 'pending' and r.created_at < now() - interval '2 minutes')
      order by r.created_at desc limit 200`,
  );
  return ok({ redemptions: rows });
});
