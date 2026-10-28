import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ok } from "@/lib/http";

/** Adherencia por presentación y por versión de configuración (solo dosis ya resueltas). */
export const GET = adminHandle("reports.view", async () => {
  const rows = await db.many(
    `select p.name as product_name, v.id as variant_id, v.name as variant_name, c.version as config_version,
            count(d.id)::int as doses,
            count(d.id) filter (where d.status = 'on_time')::int as on_time,
            count(d.id) filter (where d.status = 'late')::int as late,
            count(d.id) filter (where d.status = 'missed')::int as missed
       from doses d
       join treatments tr on tr.id = d.treatment_id
       join variant_configs c on c.id = tr.config_id
       join product_variants v on v.id = c.variant_id join products p on p.id = v.product_id
      where d.status in ('on_time', 'late', 'missed')
      group by p.name, v.id, v.name, c.version order by p.name, v.name, c.version`,
  );
  return ok({
    rows: rows.map((r) => ({ ...r, adherence_rate: r.doses ? r.on_time / r.doses : null })),
  });
});
