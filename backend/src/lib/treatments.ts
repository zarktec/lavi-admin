import { DateTime } from "luxon";
import { db, tx, type Db } from "./db";
import type { AuthUser } from "./auth-user";
import { verifyActivationToken } from "./auth-user";
import { buildDoseWindows, overlaps, validateTimes, type DoseWindow } from "./doses";
import { ApiError, badRequest, conflict, forbidden, notFound } from "./errors";
import { awardForTreatment, lockUser } from "./points";
import { getSettings } from "./settings";
import { addDays, localDate } from "./tz";

export interface ConfigRow {
  id: string;
  variant_id: string;
  version: number;
  effective_from: Date;
  doses_per_day: number;
  default_reminder_times: string[];
  window_minutes_before: number;
  window_minutes_after: number;
  duration_days: number;
  points_per_dose: number;
  missed_dose_penalty: number;
  late_dose_avoids_penalty: boolean;
  max_points_per_treatment: number | null;
  welcome_points: number;
  reminder_nudges: number[];
  backup_push_enabled: boolean;
  schedule_change_min_notice_hours: number;
  schedule_change_max_count: number;
  schedule_change_period_days: number;
  repurchase_reminder_days: number;
}

/** Versión vigente de la configuración de una presentación (la más reciente ya en efecto). */
export async function currentConfig(t: Db, variantId: string, at = new Date()): Promise<ConfigRow> {
  const c = await t.one<ConfigRow>(
    "select * from variant_configs where variant_id = $1 and effective_from <= $2 order by version desc limit 1",
    [variantId, at],
  );
  if (!c) throw new ApiError(409, "variant_not_configured", "La presentación no tiene configuración de uso publicada");
  return c;
}

export const numericId = (gid: string | null | undefined) => (gid ? gid.split("/").pop()! : "");

async function insertDoses(t: Db, treatmentId: string, windows: DoseWindow[]) {
  if (!windows.length) return;
  await t.exec(
    `insert into doses (treatment_id, window_start, window_end)
     select $1, s, e from unnest($2::timestamptz[], $3::timestamptz[]) as x(s, e)`,
    [treatmentId, windows.map((w) => w.window_start.toISOString()), windows.map((w) => w.window_end.toISOString())],
  );
}

export interface CreateTreatmentInput {
  activation_token: string;
  reminder_times?: string[];
  start_date?: string;
}

/** Reclama el tag, crea el tratamiento amarrado a la versión vigente, genera todas las dosis y da los puntos de bienvenida. */
export async function createTreatment(user: AuthUser, input: CreateTreatmentInput) {
  const claims = await verifyActivationToken(input.activation_token);
  if (claims.userId !== user.id) throw forbidden("activation_token_mismatch", "El token pertenece a otra cuenta");

  const treatmentId = await tx(async (t) => {
    await lockUser(t, user.id);
    const tag = await t.one<any>(
      `select t.*, b.status as batch_status from tags t join tag_batches b on b.id = t.batch_id where t.uid = $1 for update of t`,
      [claims.tagUid],
    );
    if (!tag) throw notFound("tag_not_found");
    if (tag.status === "blocked" || tag.batch_status === "blocked") throw conflict("tag_blocked", "Este frasco está bloqueado");
    if (tag.status === "claimed") {
      const existing = await t.one<{ id: string }>("select id from treatments where tag_uid = $1 and user_id = $2", [tag.uid, user.id]);
      if (existing) return existing.id; // reintento idempotente
      throw conflict("tag_already_claimed", "Este frasco ya fue activado");
    }
    const settings = await getSettings(t);
    if (!settings.allow_parallel_treatments) {
      const active = await t.one("select 1 from treatments where user_id = $1 and status = 'active'", [user.id]);
      if (active) throw conflict("active_treatment_exists", "Ya tienes un tratamiento activo");
    }
    const now = new Date();
    const cfg = await currentConfig(t, tag.variant_id, now);
    const times = validateTimes(input.reminder_times ?? cfg.default_reminder_times, cfg.doses_per_day, cfg.window_minutes_before, cfg.window_minutes_after);
    const today = localDate(now, user.timezone);
    const startDate = input.start_date ?? today;
    if (startDate < today || startDate > addDays(today, 7)) throw badRequest("invalid_start_date", "La fecha de inicio debe ser entre hoy y los próximos 7 días");
    const windows = buildDoseWindows({
      startDate,
      durationDays: cfg.duration_days,
      times,
      minutesBefore: cfg.window_minutes_before,
      minutesAfter: cfg.window_minutes_after,
      zone: user.timezone,
    }).filter((w) => w.window_end > now);
    if (!windows.length) throw badRequest("no_doses", "No quedan dosis por programar con estos horarios");

    const tr = await t.one<{ id: string }>(
      `insert into treatments (user_id, tag_uid, config_id, start_date, end_date, reminder_times)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [user.id, tag.uid, cfg.id, startDate, addDays(startDate, cfg.duration_days - 1), times],
    );
    await insertDoses(t, tr!.id, windows);

    // Vincula la compra de Shopify que originó el frasco (para devoluciones)
    const variant = await t.one<{ shopify_variant_id: string | null }>("select shopify_variant_id from product_variants where id = $1", [tag.variant_id]);
    let orderId: string | null = null;
    if (variant?.shopify_variant_id) {
      const order = await t.one<{ shopify_order_id: string }>(
        `select o.shopify_order_id from shopify_orders o
          where o.user_id = $1 and o.items @> $2::jsonb
            and not exists (select 1 from tags x where x.shopify_order_id = o.shopify_order_id and x.variant_id = $3)
          order by o.paid_at nulls last limit 1`,
        [user.id, JSON.stringify([{ variant_id: numericId(variant.shopify_variant_id) }]), tag.variant_id],
      );
      orderId = order?.shopify_order_id ?? null;
    }
    await t.exec("update tags set status = 'claimed', claimed_by = $2, claimed_at = now(), shopify_order_id = $3 where uid = $1", [tag.uid, user.id, orderId]);

    if (cfg.welcome_points > 0) {
      await awardForTreatment(t, settings, {
        userId: user.id,
        treatmentId: tr!.id,
        amount: cfg.welcome_points,
        reason: "welcome",
        refType: "welcome",
        refId: tr!.id,
        cap: cfg.max_points_per_treatment,
      });
    }
    return tr!.id;
  });
  return getTreatmentDetail(user.id, treatmentId);
}

/** Marca el tratamiento como terminado cuando ya no quedan dosis por resolver. */
export async function finishIfDone(t: Db, treatmentId: string): Promise<boolean> {
  const n = await t.exec(
    `update treatments set status = 'finished', finished_at = now()
      where id = $1 and status = 'active'
        and not exists (select 1 from doses where treatment_id = $1 and status = 'scheduled')`,
    [treatmentId],
  );
  return n > 0;
}

export interface PatchScheduleInput {
  reminder_times: string[];
}

export async function updateSchedule(user: AuthUser, treatmentId: string, input: PatchScheduleInput) {
  await tx(async (t) => {
    const tr = await t.one<any>("select * from treatments where id = $1 and user_id = $2 for update", [treatmentId, user.id]);
    if (!tr) throw notFound("treatment_not_found");
    if (tr.status !== "active") throw conflict("treatment_not_active", "El tratamiento ya no está activo");
    const cfg = await t.one<ConfigRow>("select * from variant_configs where id = $1", [tr.config_id]);
    const times = validateTimes(input.reminder_times, cfg!.doses_per_day, cfg!.window_minutes_before, cfg!.window_minutes_after);
    if (times.join() === [...tr.reminder_times].sort().join()) throw badRequest("schedule_unchanged", "Los horarios son los mismos");

    const used = await t.one<{ n: string }>(
      "select count(*) as n from schedule_changes where treatment_id = $1 and created_at > now() - ($2 || ' days')::interval",
      [treatmentId, String(cfg!.schedule_change_period_days)],
    );
    if (Number(used!.n) >= cfg!.schedule_change_max_count) {
      throw new ApiError(409, "schedule_change_limit", "Alcanzaste el límite de cambios de horario para este periodo", {
        max_count: cfg!.schedule_change_max_count,
        period_days: cfg!.schedule_change_period_days,
      });
    }

    const cutoff = new Date(Date.now() + cfg!.schedule_change_min_notice_hours * 3_600_000);
    // Solo se regeneran las dosis sin ventana abierta que empiezan después de la anticipación mínima
    await t.exec("delete from doses where treatment_id = $1 and status = 'scheduled' and scan_id is null and window_start >= $2", [treatmentId, cutoff]);
    const kept = await t.many<{ window_start: Date; window_end: Date }>("select window_start, window_end from doses where treatment_id = $1", [treatmentId]);
    const keptPerDay = new Map<string, number>();
    for (const k of kept) {
      const day = localDate(new Date(k.window_start.getTime() + cfg!.window_minutes_before * 60_000), user.timezone);
      keptPerDay.set(day, (keptPerDay.get(day) ?? 0) + 1);
    }
    const candidates = buildDoseWindows({
      startDate: DateTime.fromJSDate(tr.start_date, { zone: "utc" }).toISODate()!,
      durationDays: cfg!.duration_days,
      times,
      minutesBefore: cfg!.window_minutes_before,
      minutesAfter: cfg!.window_minutes_after,
      zone: user.timezone,
    }).filter((w) => w.window_start >= cutoff && !kept.some((k) => overlaps(w, k)));
    // Un día no puede pasar de doses_per_day: si ya conserva dosis, solo se agregan las últimas que faltan
    const fresh: DoseWindow[] = [];
    for (const day of new Set(candidates.map((w) => w.local_date!))) {
      const room = Math.max(0, cfg!.doses_per_day - (keptPerDay.get(day) ?? 0));
      const ofDay = candidates.filter((w) => w.local_date === day);
      fresh.push(...ofDay.slice(ofDay.length - room));
    }
    await insertDoses(t, treatmentId, fresh);
    await t.exec("update treatments set reminder_times = $2 where id = $1", [treatmentId, times]);
    await t.exec("insert into schedule_changes (treatment_id, old_times, new_times, effective_from) values ($1, $2, $3, $4)", [treatmentId, tr.reminder_times, times, cutoff]);
  });
  return getTreatmentDetail(user.id, treatmentId);
}

const SUMMARY_SQL = `
  select tr.id, tr.tag_uid, tr.status, tr.start_date, tr.end_date, tr.reminder_times, tr.points_earned, tr.created_at, tr.finished_at,
         p.id as product_id, p.name as product_name, v.id as variant_id, v.name as variant_name, v.volume_ml,
         c.id as config_id, c.version as config_version, c.doses_per_day, c.duration_days, c.points_per_dose,
         c.window_minutes_before, c.window_minutes_after, c.reminder_nudges, c.schedule_change_min_notice_hours,
         c.schedule_change_max_count, c.schedule_change_period_days, c.repurchase_reminder_days,
         (select count(*) from doses d where d.treatment_id = tr.id)::int as doses_total,
         (select count(*) from doses d where d.treatment_id = tr.id and d.status = 'on_time')::int as doses_on_time,
         (select count(*) from doses d where d.treatment_id = tr.id and d.status = 'late')::int as doses_late,
         (select count(*) from doses d where d.treatment_id = tr.id and d.status = 'missed')::int as doses_missed,
         (select shopify_variant_id from product_variants where id = v.id) as shopify_variant_id,
         (select count(*) from schedule_changes sc where sc.treatment_id = tr.id and sc.created_at > now() - (c.schedule_change_period_days || ' days')::interval)::int as schedule_changes_in_period
    from treatments tr
    join tags tg on tg.uid = tr.tag_uid
    join product_variants v on v.id = tg.variant_id
    join products p on p.id = v.product_id
    join variant_configs c on c.id = tr.config_id`;

function shapeSummary(r: any) {
  const end = DateTime.fromJSDate(r.end_date, { zone: "utc" });
  const daysLeft = r.status === "active" ? Math.max(0, Math.ceil(end.diff(DateTime.utc().startOf("day"), "days").days) + 1) : 0;
  return {
    id: r.id,
    tag_uid: r.tag_uid,
    status: r.status,
    start_date: DateTime.fromJSDate(r.start_date, { zone: "utc" }).toISODate(),
    end_date: end.toISODate(),
    reminder_times: r.reminder_times,
    points_earned: r.points_earned,
    product: { id: r.product_id, name: r.product_name },
    variant: { id: r.variant_id, name: r.variant_name, volume_ml: r.volume_ml, shopify_variant_id: r.shopify_variant_id },
    config: {
      id: r.config_id,
      version: r.config_version,
      doses_per_day: r.doses_per_day,
      duration_days: r.duration_days,
      points_per_dose: r.points_per_dose,
      window_minutes_before: r.window_minutes_before,
      window_minutes_after: r.window_minutes_after,
      reminder_nudges: r.reminder_nudges,
      schedule_change_min_notice_hours: r.schedule_change_min_notice_hours,
      schedule_change_max_count: r.schedule_change_max_count,
      schedule_change_period_days: r.schedule_change_period_days,
    },
    progress: { total: r.doses_total, on_time: r.doses_on_time, late: r.doses_late, missed: r.doses_missed },
    schedule_changes_left: Math.max(0, r.schedule_change_max_count - r.schedule_changes_in_period),
    days_left: daysLeft,
    repurchase_suggested: r.status === "active" && r.repurchase_reminder_days > 0 && daysLeft <= r.repurchase_reminder_days,
    created_at: r.created_at,
    finished_at: r.finished_at,
  };
}

export async function listTreatments(userId: string) {
  const rows = await db.many(`${SUMMARY_SQL} where tr.user_id = $1 order by tr.created_at desc`, [userId]);
  return rows.map((r) => shapeSummary(r));
}

export async function getTreatmentDetail(userId: string, id: string, t: Db = db) {
  const r = await t.one(`${SUMMARY_SQL} where tr.id = $1 and tr.user_id = $2`, [id, userId]);
  if (!r) throw notFound("treatment_not_found");
  const doses = await t.many(
    "select id, window_start, window_end, status, recorded_at from doses where treatment_id = $1 order by window_start",
    [id],
  );
  return { ...shapeSummary(r), doses };
}
