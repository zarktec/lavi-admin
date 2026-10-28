import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { configSchema } from "@/lib/catalog";
import { db, tx } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { ok, parseBody } from "@/lib/http";

export const GET = adminHandle<{ id: string }>("catalog.view", async (_req, { id }) => {
  const configs = await db.many("select * from variant_configs where variant_id = $1 order by version desc", [id]);
  const rules = await db.many("select * from streak_rules where config_id = any($1) order by streak_length", [configs.map((c) => c.id)]);
  return ok({ configs: configs.map((c) => ({ ...c, streak_rules: rules.filter((r) => r.config_id === c.id) })) });
});

/** Publicar una configuración crea siempre una versión nueva; las anteriores no se tocan. */
export const POST = adminHandle<{ id: string }>("catalog.manage", async (req, { id }, a) => {
  const b = await parseBody(req, configSchema);
  const out = await tx(async (t) => {
    if (!(await t.one("select 1 from product_variants where id = $1", [id]))) throw notFound("variant_not_found");
    const v = await t.one<{ v: number }>("select coalesce(max(version), 0) + 1 as v from variant_configs where variant_id = $1", [id]);
    const c = await t.one<any>(
      `insert into variant_configs (variant_id, version, effective_from, doses_per_day, default_reminder_times, window_minutes_before, window_minutes_after,
         duration_days, points_per_dose, missed_dose_penalty, late_dose_avoids_penalty, max_points_per_treatment, welcome_points, reminder_nudges,
         backup_push_enabled, schedule_change_min_notice_hours, schedule_change_max_count, schedule_change_period_days, repurchase_reminder_days, created_by)
       values ($1,$2,coalesce($3, now()),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20) returning *`,
      [id, v!.v, b.effective_from ?? null, b.doses_per_day, b.default_reminder_times, b.window_minutes_before, b.window_minutes_after, b.duration_days,
       b.points_per_dose, b.missed_dose_penalty, b.late_dose_avoids_penalty, b.max_points_per_treatment, b.welcome_points, JSON.stringify(b.reminder_nudges),
       b.backup_push_enabled, b.schedule_change_min_notice_hours, b.schedule_change_max_count, b.schedule_change_period_days, b.repurchase_reminder_days, a.admin.id],
    );
    for (const r of b.streak_rules) {
      await t.exec("insert into streak_rules (config_id, streak_length, bonus_points, repeatable) values ($1, $2, $3, $4)", [c.id, r.streak_length, r.bonus_points, r.repeatable]);
    }
    await audit(t, a.admin.id, "config.publish", "variant_config", c.id, null, { ...c, streak_rules: b.streak_rules });
    return { ...c, streak_rules: b.streak_rules };
  });
  return ok(out, 201);
});
