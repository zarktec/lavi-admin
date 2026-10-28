import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { ok } from "@/lib/http";
import { getBalance } from "@/lib/points";

/** Ficha de la clienta: calendario de dosis, lecturas, cambios de horario, puntos y canjes. */
export const GET = adminHandle<{ id: string }>("customers.view", async (_req, { id }) => {
  const user = await db.one("select id, email, name, phone, timezone, status, data_consent_at, created_at from users where id = $1", [id]);
  if (!user) throw notFound("user_not_found", "Clienta no encontrada");
  const treatments = await db.many(
    `select tr.id, tr.tag_uid, tr.status, tr.start_date, tr.end_date, tr.reminder_times, tr.points_earned, p.name as product_name, v.name as variant_name, c.version as config_version
       from treatments tr join tags t on t.uid = tr.tag_uid join product_variants v on v.id = t.variant_id join products p on p.id = v.product_id
       join variant_configs c on c.id = tr.config_id where tr.user_id = $1 order by tr.created_at desc`,
    [id],
  );
  const doses = await db.many(
    "select d.id, d.treatment_id, d.window_start, d.window_end, d.status, d.recorded_at from doses d where d.treatment_id = any($1) order by d.window_start",
    [treatments.map((t) => t.id)],
  );
  const [scans, changes, ledger, redemptions, tags, adjustments] = await Promise.all([
    db.many("select id, tag_uid, counter, result, reason, offline, server_time, device_time from scans where user_id = $1 order by server_time desc limit 100", [id]),
    db.many("select sc.* from schedule_changes sc join treatments t on t.id = sc.treatment_id where t.user_id = $1 order by sc.created_at desc", [id]),
    db.many("select id, amount, reason, reference_type, expires_at, note, created_by, created_at from points_ledger where user_id = $1 order by id desc limit 200", [id]),
    db.many("select r.id, r.points, r.code, r.status, r.expires_at, r.created_at, r.error, o.name as option_name from redemptions r join redemption_options o on o.id = r.option_id where r.user_id = $1 order by r.created_at desc", [id]),
    db.many("select uid, status, claimed_at from tags where claimed_by = $1", [id]),
    db.many("select id, amount, reason, status, created_at from points_adjustments where user_id = $1 order by created_at desc", [id]),
  ]);
  return ok({
    user,
    balance: await getBalance(db, id),
    treatments: treatments.map((t) => ({ ...t, doses: doses.filter((d) => d.treatment_id === t.id) })),
    scans, schedule_changes: changes, ledger, redemptions, tags, adjustments,
  });
});
