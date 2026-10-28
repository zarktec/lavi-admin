import { db, tx } from "./db";
import { sendPush, fillTemplate } from "./push";
import { addLedger, expireUserPoints, expiryFor, getBalance, lockUser } from "./points";
import { finalizeRedemption } from "./redemptions";
import { getSettings } from "./settings";
import { shopify } from "./shopify";
import { finishIfDone } from "./treatments";

/** Cierra ventanas vencidas sin lectura: marca perdida, aplica penalización (corta la racha) y termina tratamientos. */
export async function closeDoses(now = new Date()) {
  const due = await db.many<{ id: string; treatment_id: string }>(
    "select id, treatment_id from doses where status = 'scheduled' and window_end < $1 order by window_end limit 2000",
    [now],
  );
  const settings = await getSettings(db);
  let closed = 0;
  for (const d of due) {
    await tx(async (t) => {
      const dose = await t.one<any>(
        `select d.id, d.treatment_id, tr.user_id, c.missed_dose_penalty
           from doses d join treatments tr on tr.id = d.treatment_id join variant_configs c on c.id = tr.config_id
          where d.id = $1 and d.status = 'scheduled' for update of d`,
        [d.id],
      );
      if (!dose) return;
      await t.exec("update doses set status = 'missed' where id = $1", [dose.id]);
      if (dose.missed_dose_penalty > 0) {
        await lockUser(t, dose.user_id);
        let penalty = dose.missed_dose_penalty;
        if (!settings.allow_negative_balance) penalty = Math.min(penalty, Math.max(0, await getBalance(t, dose.user_id)));
        if (penalty > 0) {
          await addLedger(t, { userId: dose.user_id, amount: -penalty, reason: "missed_dose", refType: "dose_penalty", refId: dose.id });
        }
      }
      await finishIfDone(t, dose.treatment_id);
      closed++;
    });
  }
  return { closed };
}

/** Push de respaldo a mitad de ventana para dosis sin lectura, si la configuración lo permite. */
export async function backupPush(now = new Date()) {
  const rows = await db.many<{ id: string; user_id: string; product_name: string }>(
    `select d.id, tr.user_id, p.name as product_name
       from doses d
       join treatments tr on tr.id = d.treatment_id and tr.status = 'active'
       join variant_configs c on c.id = tr.config_id
       join tags tg on tg.uid = tr.tag_uid
       join product_variants v on v.id = tg.variant_id join products p on p.id = v.product_id
      where d.status = 'scheduled' and d.backup_push_sent_at is null and c.backup_push_enabled
        and d.window_start + (d.window_end - d.window_start) / 2 <= $1 and d.window_end > $1`,
    [now],
  );
  const settings = await getSettings(db);
  let sent = 0;
  for (const r of rows) {
    const claimed = await db.exec("update doses set backup_push_sent_at = now() where id = $1 and backup_push_sent_at is null", [r.id]);
    if (!claimed) continue;
    const vars = { product: r.product_name };
    sent += await sendPush(db, r.user_id, {
      title: fillTemplate(settings.notification_texts.backup_title, vars),
      body: fillTemplate(settings.notification_texts.backup_body, vars),
      data: { type: "backup", dose_id: r.id },
    });
  }
  return { candidates: rows.length, sent };
}

export async function expirePoints(now = new Date()) {
  const users = await db.many<{ user_id: string }>(
    "select distinct user_id from points_ledger where amount > 0 and expires_at is not null and expires_at <= $1",
    [now],
  );
  let expired = 0;
  for (const u of users) {
    expired += await tx(async (t) => {
      await lockUser(t, u.user_id);
      return expireUserPoints(t, u.user_id, now);
    });
  }
  return { users: users.length, expired };
}

/** Códigos vencidos sin usar: devuelve puntos si el parámetro global lo indica. */
export async function expireRedemptions(now = new Date()) {
  const settings = await getSettings(db);
  const rows = await db.many<any>(
    "select id, user_id, points, shopify_discount_id from redemptions where status = 'issued' and expires_at <= $1",
    [now],
  );
  for (const r of rows) {
    await tx(async (t) => {
      const done = await t.exec("update redemptions set status = 'expired' where id = $1 and status = 'issued'", [r.id]);
      if (done && settings.refund_points_on_expired_code) {
        await lockUser(t, r.user_id);
        await addLedger(t, { userId: r.user_id, amount: r.points, reason: "redemption_expired_refund", refType: "redemption_expired", refId: r.id, expiresAt: expiryFor(settings) });
      }
    });
    if (r.shopify_discount_id) await shopify.deleteDiscount(r.shopify_discount_id).catch(() => {});
  }
  return { expired: rows.length };
}

/** Canjes que quedaron a medias (proceso interrumpido): se completan o se revierten. */
export async function reconcileRedemptions(olderThanMinutes = 2) {
  const rows = await db.many<{ id: string }>(
    "select id from redemptions where status = 'pending' and created_at < now() - ($1 || ' minutes')::interval",
    [String(olderThanMinutes)],
  );
  let completed = 0;
  let reversed = 0;
  for (const r of rows) {
    const out = await finalizeRedemption(r.id);
    if (out.ok) completed++;
    else reversed++;
  }
  return { completed, reversed };
}
