import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { ok, parseQuery } from "@/lib/http";

/** Búsqueda de un tag por UID con su historial de lecturas. */
export const GET = adminHandle("tags.view", async (req) => {
  const { uid } = parseQuery(req, z.object({ uid: z.string().trim().min(6).max(20) }));
  const tag = await db.one<any>(
    `select t.uid, t.status, t.last_counter, t.key_ref, t.claimed_at, t.blocked_reason, t.shopify_order_id, b.batch_code, b.status as batch_status,
            v.name as variant_name, p.name as product_name, u.id as user_id, u.email as user_email, u.name as user_name
       from tags t join tag_batches b on b.id = t.batch_id join product_variants v on v.id = t.variant_id join products p on p.id = v.product_id
       left join users u on u.id = t.claimed_by where t.uid = $1`,
    [uid.toUpperCase()],
  );
  if (!tag) throw notFound("tag_not_found", "No existe un tag con ese UID");
  const scans = await db.many(
    `select s.id, s.counter, s.result, s.reason, s.cmac_valid, s.offline, s.server_time, s.device_time, u.email as user_email
       from scans s left join users u on u.id = s.user_id where s.tag_uid = $1 order by s.server_time desc limit 100`,
    [tag.uid],
  );
  return ok({ tag, scans });
});
