import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ok, parseQuery } from "@/lib/http";

/**
 * Recompra de quienes completan el tratamiento frente a quienes lo abandonan.
 * "Completa" = al menos `threshold` (por defecto 80 %) de sus dosis registradas (a tiempo o tardías).
 * Recompra = otro tratamiento posterior o una compra pagada posterior de la misma presentación.
 */
export const GET = adminHandle("reports.view", async (req) => {
  const { threshold } = parseQuery(req, z.object({ threshold: z.coerce.number().min(0.1).max(1).default(0.8) }));
  const rows = await db.many(
    `with t as (
       select tr.id, tr.user_id, tr.created_at, tr.tag_uid, tg.variant_id, v.shopify_variant_id,
              (count(d.id) filter (where d.status in ('on_time','late')))::float / nullif(count(d.id), 0) as done_ratio
         from treatments tr join tags tg on tg.uid = tr.tag_uid join product_variants v on v.id = tg.variant_id
         join doses d on d.treatment_id = tr.id
        where tr.status in ('finished', 'cancelled')
        group by tr.id, tr.user_id, tr.created_at, tr.tag_uid, tg.variant_id, v.shopify_variant_id
     ), x as (
       select t.*, (done_ratio >= $1) as completed,
              (exists (select 1 from treatments t2 where t2.user_id = t.user_id and t2.created_at > t.created_at)
               or exists (select 1 from shopify_orders o where o.user_id = t.user_id and o.paid_at > t.created_at
                          and t.shopify_variant_id is not null and o.items @> jsonb_build_array(jsonb_build_object('variant_id', regexp_replace(t.shopify_variant_id, '^.*/', ''))))) as repurchased
         from t
     )
     select completed, count(*)::int as treatments, count(*) filter (where repurchased)::int as repurchased from x group by completed`,
    [threshold],
  );
  const get = (c: boolean) => rows.find((r) => r.completed === c) ?? { treatments: 0, repurchased: 0 };
  const rate = (r: { treatments: number; repurchased: number }) => (r.treatments ? r.repurchased / r.treatments : null);
  return ok({
    threshold,
    completed: { ...get(true), rate: rate(get(true)) },
    abandoned: { ...get(false), rate: rate(get(false)) },
  });
});
