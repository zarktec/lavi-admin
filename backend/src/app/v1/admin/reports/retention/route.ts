import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ok } from "@/lib/http";

/** Retención por cohorte mensual (mes de activación) a 2, 4 y 8 semanas: siguen registrando dosis a tiempo o tardías. */
export const GET = adminHandle("reports.view", async () => {
  const rows = await db.many(
    `select to_char(date_trunc('month', tr.created_at), 'YYYY-MM') as cohort,
            count(*)::int as size,
            count(*) filter (where tr.created_at + interval '2 weeks' <= now())::int as eligible_w2,
            count(*) filter (where tr.created_at + interval '4 weeks' <= now())::int as eligible_w4,
            count(*) filter (where tr.created_at + interval '8 weeks' <= now())::int as eligible_w8,
            count(*) filter (where exists (select 1 from doses d where d.treatment_id = tr.id and d.status in ('on_time','late') and d.recorded_at >= tr.created_at + interval '2 weeks'))::int as retained_w2,
            count(*) filter (where exists (select 1 from doses d where d.treatment_id = tr.id and d.status in ('on_time','late') and d.recorded_at >= tr.created_at + interval '4 weeks'))::int as retained_w4,
            count(*) filter (where exists (select 1 from doses d where d.treatment_id = tr.id and d.status in ('on_time','late') and d.recorded_at >= tr.created_at + interval '8 weeks'))::int as retained_w8
       from treatments tr group by 1 order by 1 desc limit 24`,
  );
  return ok({
    cohorts: rows.map((r) => ({
      cohort: r.cohort,
      size: r.size,
      w2: r.eligible_w2 ? r.retained_w2 / r.eligible_w2 : null,
      w4: r.eligible_w4 ? r.retained_w4 / r.eligible_w4 : null,
      w8: r.eligible_w8 ? r.retained_w8 / r.eligible_w8 : null,
    })),
  });
});
