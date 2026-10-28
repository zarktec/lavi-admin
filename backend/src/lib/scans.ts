import { randomUUID } from "node:crypto";
import { db, tx, type Db } from "./db";
import { signActivationToken, type AuthUser } from "./auth-user";
import { envOpt } from "./env";
import { streakAt } from "./doses";
import { loadMasterKeys, parseTagUrl, parseTestTagUrl, testCounter, verifySun, type SunResult } from "./ntag";
import { addLedger, awardForTreatment, expiryFor, getBalance, lockUser } from "./points";
import { getSettings, type Settings } from "./settings";
import { currentConfig, finishIfDone, type ConfigRow } from "./treatments";

export type RejectReason = "invalid_signature" | "replayed" | "owned_by_other" | "blocked" | "offline_expired";

export interface ScanInput {
  tag_url: string;
  device_time?: string;
  offline?: boolean;
}

type Json = Record<string, unknown>;

const rejected = (reason: RejectReason): Json => ({ result: "rejected", reason });

interface DoseRow {
  id: string;
  window_start: Date;
  window_end: Date;
  status: "scheduled" | "on_time" | "late" | "missed";
}

async function recordScan(
  t: Db,
  s: { id: string; tagUid: string | null; userId: string; counter: number | null; valid: boolean; counted: boolean; input: ScanInput; deviceTime: Date | null },
  response: Json,
  doseId: string | null = null,
) {
  await t.exec(
    `insert into scans (id, tag_uid, user_id, dose_id, counter, cmac_valid, counted, result, reason, response, device_time, offline)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)`,
    [
      s.id, s.tagUid, s.userId, doseId, s.counter, s.valid, s.counted,
      response.result, (response.reason as string) ?? null, JSON.stringify(response), s.deviceTime, !!s.input.offline,
    ],
  );
}

async function nextDose(t: Db, treatmentId: string, after: Date) {
  return t.one<{ id: string; window_start: Date; window_end: Date }>(
    "select id, window_start, window_end from doses where treatment_id = $1 and status = 'scheduled' and window_start > $2 order by window_start limit 1",
    [treatmentId, after],
  );
}

/**
 * Punto único de toda lectura del tag. El backend decide el resultado; la app solo muestra la pantalla.
 * Controles en orden (se detiene en el primero que falla): firma/contador → tag reclamado → es de esta clienta → ventana abierta.
 */
export async function processScan(user: AuthUser, input: ScanInput): Promise<Json> {
  const scanId = randomUUID();
  const serverNow = new Date();
  const deviceTime = input.device_time ? new Date(input.device_time) : null;
  const base = { id: scanId, userId: user.id, input, deviceTime: deviceTime && !isNaN(deviceTime.getTime()) ? deviceTime : null };

  // 1) Firma y contador
  const host = envOpt("APP_DOMAIN") || undefined;
  const parsed = parseTagUrl(input.tag_url, host);
  let sun: SunResult = parsed ? verifySun(parsed.d, parsed.c, loadMasterKeys()) : { ok: false };
  if (!sun.ok) {
    // Solo con NFC_INSECURE_TEST_MODE (nunca en producción): tag de prueba sin firma
    const testUid = parseTestTagUrl(input.tag_url, host);
    if (testUid) sun = { ok: true, uid: testUid, counter: testCounter(base.deviceTime ?? serverNow), keyRef: "test" };
  }
  if (!sun.ok) {
    const res = rejected("invalid_signature");
    await recordScan(db, { ...base, tagUid: null, counter: null, valid: false, counted: false }, res);
    return res;
  }

  return tx(async (t) => {
    await lockUser(t, user.id);
    const tag = await t.one<any>(
      `select t.*, b.status as batch_status, b.batch_code from tags t join tag_batches b on b.id = t.batch_id
        where t.uid = $1 for update of t`,
      [sun.uid],
    );
    const ctx = { ...base, tagUid: sun.uid, counter: sun.counter, valid: true };
    if (!tag) {
      // Firma válida de un tag que no está importado: no revelamos más detalle
      const res = rejected("invalid_signature");
      await recordScan(t, { ...ctx, tagUid: null, valid: false, counted: false }, res);
      return res;
    }

    // Idempotencia: la misma lectura (tag + contador) reenviada por la misma usuaria devuelve el resultado guardado
    const prior = await t.one<{ user_id: string; response: Json }>(
      "select user_id, response from scans where tag_uid = $1 and counter = $2 and counted",
      [tag.uid, sun.counter],
    );
    if (prior && prior.user_id === user.id) return { ...prior.response, idempotent_replay: true };
    if (prior || sun.counter <= tag.last_counter) {
      const res = rejected("replayed");
      await recordScan(t, { ...ctx, counted: false }, res);
      return res;
    }
    await t.exec("update tags set last_counter = $2 where uid = $1", [tag.uid, sun.counter]);
    const counted = { ...ctx, counted: true };

    const settings = await getSettings(t);

    // Lectura sin conexión: debe llegar dentro del plazo configurado
    if (input.offline && base.deviceTime) {
      const ageHours = (serverNow.getTime() - base.deviceTime.getTime()) / 3_600_000;
      const futureMin = (base.deviceTime.getTime() - serverNow.getTime()) / 60_000;
      if (ageHours > settings.offline_scan_max_hours || futureMin > settings.offline_device_time_tolerance_minutes) {
        const res = rejected("offline_expired");
        await recordScan(t, counted, res);
        return res;
      }
    }

    if (tag.status === "blocked" || tag.batch_status === "blocked") {
      const res = rejected("blocked");
      await recordScan(t, counted, res);
      return res;
    }

    // 2) ¿Tag reclamado?
    if (tag.status === "unclaimed") {
      const cfg = await currentConfig(t, tag.variant_id, serverNow);
      const info = await t.one<any>(
        `select p.id as product_id, p.name as product_name, v.id as variant_id, v.name as variant_name, v.volume_ml
           from product_variants v join products p on p.id = v.product_id where v.id = $1`,
        [tag.variant_id],
      );
      const res: Json = {
        result: "activation_required",
        activation_token: await signActivationToken({ tagUid: tag.uid, userId: user.id, scanId }, settings.activation_token_minutes),
        expires_in: settings.activation_token_minutes * 60,
        product: { id: info.product_id, name: info.product_name },
        variant: { id: info.variant_id, name: info.variant_name, volume_ml: info.volume_ml },
        suggested_times: cfg.default_reminder_times,
        config: {
          doses_per_day: cfg.doses_per_day,
          duration_days: cfg.duration_days,
          points_per_dose: cfg.points_per_dose,
          welcome_points: cfg.welcome_points,
          window_minutes_before: cfg.window_minutes_before,
          window_minutes_after: cfg.window_minutes_after,
          schedule_change_min_notice_hours: cfg.schedule_change_min_notice_hours,
        },
      };
      await recordScan(t, counted, res);
      return res;
    }

    // 3) ¿Es de esta clienta?
    if (tag.claimed_by !== user.id) {
      const res = rejected("owned_by_other");
      await recordScan(t, counted, res);
      return res;
    }

    const treatment = await t.one<{ id: string; config_id: string; status: string }>(
      "select id, config_id, status from treatments where tag_uid = $1",
      [tag.uid],
    );
    if (!treatment || treatment.status !== "active") {
      const res: Json = { result: "treatment_finished", treatment_id: treatment?.id ?? null, repurchase_suggested: true };
      await recordScan(t, counted, res);
      return res;
    }
    const cfg = (await t.one<ConfigRow>("select * from variant_configs where id = $1", [treatment.config_id]))!;

    // 4) ¿Ventana abierta? (hora del servidor; en lecturas sin conexión, la del dispositivo con tolerancia)
    const res = await evaluateDose(t, user, treatment.id, cfg, settings, counted.id, !!input.offline && !!base.deviceTime, base.deviceTime, serverNow);
    await recordScan(t, counted, res.body, res.doseId);
    if (res.doseId) await t.exec("update doses set scan_id = $2 where id = $1 and scan_id is null", [res.doseId, scanId]);
    return res.body;
  });
}

async function evaluateDose(
  t: Db,
  user: AuthUser,
  treatmentId: string,
  cfg: ConfigRow,
  settings: Settings,
  scanId: string,
  offline: boolean,
  deviceTime: Date | null,
  serverNow: Date,
): Promise<{ body: Json; doseId: string | null }> {
  const evalAt = offline && deviceTime ? deviceTime : serverNow;
  const tolMs = offline ? settings.offline_device_time_tolerance_minutes * 60_000 : 0;

  // Dosis cuya ventana (con tolerancia) contiene la hora evaluada; también las ya cerradas como perdidas (lectura tardía sin conexión)
  const open = await t.one<DoseRow>(
    `select id, window_start, window_end, status from doses
      where treatment_id = $1 and status in ('scheduled', 'missed')
        and window_start - ($3 || ' milliseconds')::interval <= $2 and window_end + ($3 || ' milliseconds')::interval >= $2
      order by window_start limit 1`,
    [treatmentId, evalAt, String(tolMs)],
  );

  if (offline && !open) return { body: rejected("offline_expired"), doseId: null };

  if (open && (open.status === "scheduled" || offline)) {
    return { body: await recordOnTime(t, user, treatmentId, cfg, settings, open, scanId, evalAt), doseId: open.id };
  }

  const doses = await t.many<DoseRow>("select id, window_start, window_end, status from doses where treatment_id = $1 order by window_start", [treatmentId]);

  // Tardía: la dosis más reciente cuya ventana ya cerró sin lectura, mientras no abra la siguiente
  const past = doses.filter((d) => d.window_end < evalAt);
  const lastPast = past[past.length - 1];
  if (lastPast && (lastPast.status === "scheduled" || lastPast.status === "missed")) {
    await t.exec("update doses set status = 'late', recorded_at = $2 where id = $1", [lastPast.id, serverNow]);
    if (lastPast.status === "missed" && cfg.late_dose_avoids_penalty && cfg.missed_dose_penalty > 0) {
      await addLedger(t, {
        userId: user.id, amount: cfg.missed_dose_penalty, reason: "late_dose_penalty_reversal",
        refType: "dose_penalty_reversal", refId: lastPast.id, expiresAt: expiryFor(settings, serverNow),
      });
    }
    const finished = await finishIfDone(t, treatmentId);
    const next = await nextDose(t, treatmentId, serverNow);
    return {
      body: { result: "late", dose_id: lastPast.id, points_earned: 0, balance: await getBalance(t, user.id), next_dose: next ?? null, treatment_completed: finished },
      doseId: lastPast.id,
    };
  }

  const next = doses.find((d) => d.status === "scheduled" && d.window_start > evalAt);
  if (!next) {
    return { body: { result: "no_pending_dose", next_dose: null }, doseId: null };
  }
  // Ya cumplió la dosis en curso (o la anterior) y la siguiente aún no abre → no hay nada pendiente ahora
  const started = doses.filter((d) => d.window_start <= evalAt);
  const lastStarted = started[started.length - 1];
  if (lastStarted && (lastStarted.status === "on_time" || lastStarted.status === "late")) {
    return { body: { result: "no_pending_dose", next_dose: { id: next.id, window_start: next.window_start, window_end: next.window_end } }, doseId: null };
  }
  return { body: { result: "too_early", opens_at: next.window_start, window_end: next.window_end, dose_id: next.id }, doseId: null };
}

async function recordOnTime(
  t: Db,
  user: AuthUser,
  treatmentId: string,
  cfg: ConfigRow,
  settings: Settings,
  dose: DoseRow,
  scanId: string,
  at: Date,
): Promise<Json> {
  await t.exec("update doses set status = 'on_time', recorded_at = $2 where id = $1", [dose.id, new Date()]);

  // Si el cierre automático ya había penalizado esta dosis (lectura sin conexión llegada tarde), se revierte la penalización
  if (dose.status === "missed" && cfg.missed_dose_penalty > 0) {
    await addLedger(t, {
      userId: user.id, amount: cfg.missed_dose_penalty, reason: "penalty_reversal",
      refType: "dose_penalty_reversal", refId: dose.id, expiresAt: expiryFor(settings),
    });
  }

  const points = await awardForTreatment(t, settings, {
    userId: user.id, treatmentId, amount: cfg.points_per_dose, reason: "dose_on_time",
    refType: "dose", refId: dose.id, cap: cfg.max_points_per_treatment,
  });

  // Racha: dosis a tiempo consecutivas terminando en esta
  const all = await t.many<{ id: string; status: string }>("select id, status from doses where treatment_id = $1 order by window_start", [treatmentId]);
  const idx = all.findIndex((d) => d.id === dose.id);
  const streak = streakAt(all.map((d) => d.status), idx);
  const rules = await t.many<{ id: string; streak_length: number; bonus_points: number; repeatable: boolean }>(
    "select id, streak_length, bonus_points, repeatable from streak_rules where config_id = $1 order by streak_length",
    [cfg.id],
  );
  let bonus = 0;
  for (const r of rules) {
    const hit = r.repeatable ? streak > 0 && streak % r.streak_length === 0 : streak === r.streak_length;
    if (hit) {
      bonus += await awardForTreatment(t, settings, {
        userId: user.id, treatmentId, amount: r.bonus_points, reason: "streak_bonus",
        refType: "streak_rule", refId: `${dose.id}:${r.id}`, cap: cfg.max_points_per_treatment,
      });
    }
  }

  const completed = await finishIfDone(t, treatmentId);
  const next = await nextDose(t, treatmentId, at);
  return {
    result: "dose_recorded",
    dose_id: dose.id,
    points_earned: points,
    bonus_points: bonus,
    streak,
    balance: await getBalance(t, user.id),
    next_dose: next ?? null,
    treatment_completed: completed,
  };
}

