import { randomBytes } from "node:crypto";
import { db, tx } from "./db";
import type { AuthUser } from "./auth-user";
import { ApiError, conflict, notFound } from "./errors";
import { addLedger, expiryFor, getBalance, lockUser } from "./points";
import { getSettings } from "./settings";
import { shopify, toGid } from "./shopify";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => "LV-" + Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");

export async function listOptions(userId: string) {
  const settings = await getSettings(db);
  const balance = await getBalance(db, userId);
  const options = await db.many(
    "select id, name, points_cost, reward_type, reward_value from redemption_options where active order by points_cost",
  );
  return {
    balance,
    min_points_to_redeem: settings.min_points_to_redeem,
    options: options.map((o) => ({
      ...o,
      reward_value: o.reward_value == null ? null : Number(o.reward_value),
      affordable: balance >= Math.max(o.points_cost, settings.min_points_to_redeem),
    })),
  };
}

const shapeRedemption = (r: any) => ({
  id: r.id,
  option_id: r.option_id,
  option_name: r.option_name,
  reward_type: r.reward_type,
  points: r.points,
  code: r.status === "issued" || r.status === "used" ? r.code : null,
  status: r.status,
  expires_at: r.expires_at,
  used_at: r.used_at,
  created_at: r.created_at,
});

export async function listRedemptions(userId: string) {
  const rows = await db.many(
    `select r.*, o.name as option_name, o.reward_type from redemptions r join redemption_options o on o.id = r.option_id
      where r.user_id = $1 order by r.created_at desc limit 100`,
    [userId],
  );
  return rows.map(shapeRedemption);
}

/**
 * Redime puntos: descuenta primero (con la usuaria bloqueada), luego crea el código en Shopify.
 * Idempotente por `Idempotency-Key`. Si Shopify falla se registra la reversa y el canje queda como 'failed'.
 */
export async function redeem(user: AuthUser, optionId: string, idemKey: string): Promise<{ status: number; body: any }> {
  const claim = await db.one(
    "insert into idempotency_keys (user_id, key) values ($1, $2) on conflict do nothing returning key",
    [user.id, `redeem:${idemKey}`],
  );
  if (!claim) {
    const prior = await db.one<{ status: string; http_status: number; response: any }>(
      "select status, http_status, response from idempotency_keys where user_id = $1 and key = $2",
      [user.id, `redeem:${idemKey}`],
    );
    if (prior?.status === "done") return { status: prior.http_status, body: prior.response };
    throw conflict("request_in_progress", "Este canje ya se está procesando");
  }

  const finish = async (status: number, body: unknown) => {
    await db.exec("update idempotency_keys set status = 'done', http_status = $3, response = $4::jsonb where user_id = $1 and key = $2", [
      user.id, `redeem:${idemKey}`, status, JSON.stringify(body),
    ]);
    return { status, body };
  };

  let redemptionId: string;
  try {
    redemptionId = await tx(async (t) => {
      await lockUser(t, user.id);
      const settings = await getSettings(t);
      const opt = await t.one<any>("select * from redemption_options where id = $1 and active", [optionId]);
      if (!opt) throw notFound("option_not_found", "Esa opción de canje no está disponible");
      const balance = await getBalance(t, user.id);
      if (balance < settings.min_points_to_redeem) {
        throw new ApiError(409, "below_minimum", `Necesitas al menos ${settings.min_points_to_redeem} puntos para redimir`);
      }
      if (balance < opt.points_cost && !settings.allow_negative_balance) {
        throw new ApiError(409, "insufficient_points", "No tienes puntos suficientes");
      }
      const r = await t.one<{ id: string }>(
        `insert into redemptions (user_id, option_id, points, code, status) values ($1, $2, $3, $4, 'pending') returning id`,
        [user.id, opt.id, opt.points_cost, newCode()],
      );
      await addLedger(t, { userId: user.id, amount: -opt.points_cost, reason: "redemption", refType: "redemption", refId: r!.id });
      return r!.id;
    });
  } catch (e) {
    if (e instanceof ApiError) {
      await finish(e.status, { error: { code: e.code, message: e.message } });
    } else {
      await db.exec("delete from idempotency_keys where user_id = $1 and key = $2", [user.id, `redeem:${idemKey}`]);
    }
    throw e;
  }

  const out = await finalizeRedemption(redemptionId);
  if (out.ok) return finish(201, out.redemption);
  return finish(502, { error: { code: "shopify_unavailable", message: "No pudimos generar tu código. Tus puntos fueron devueltos; intenta de nuevo." } });
}

/** Crea el descuento en Shopify para un canje pendiente; si falla, revierte los puntos. */
export async function finalizeRedemption(id: string): Promise<{ ok: true; redemption: any } | { ok: false; error: string }> {
  const r = await db.one<any>(
    `select r.*, o.name as option_name, o.reward_type, o.reward_value, o.shopify_product_id, o.combines_with, u.shopify_customer_id
       from redemptions r join redemption_options o on o.id = r.option_id join users u on u.id = r.user_id where r.id = $1`,
    [id],
  );
  if (!r || r.status !== "pending") return { ok: false, error: "not_pending" };
  const settings = await getSettings(db);
  const expiresAt = new Date(Date.now() + settings.redemption_code_valid_days * 86_400_000);
  try {
    const discount = await shopify.createDiscount({
      code: r.code,
      title: `Canje de puntos: ${r.option_name}`,
      customerGid: toGid("Customer", r.shopify_customer_id),
      endsAt: expiresAt,
      rewardType: r.reward_type,
      rewardValue: r.reward_value == null ? null : Number(r.reward_value),
      productGid: r.shopify_product_id ? toGid("Product", r.shopify_product_id) : null,
      combinesWith: r.combines_with,
    });
    await db.exec("update redemptions set status = 'issued', shopify_discount_id = $2, expires_at = $3, error = null where id = $1", [id, discount.id, expiresAt]);
    return { ok: true, redemption: shapeRedemption({ ...r, status: "issued", expires_at: expiresAt }) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await tx(async (t) => {
      await lockUser(t, r.user_id);
      await addLedger(t, { userId: r.user_id, amount: r.points, reason: "redemption_reversal", refType: "redemption_reversal", refId: id, expiresAt: expiryFor(settings) });
      await t.exec("update redemptions set status = 'failed', error = $2 where id = $1", [id, message.slice(0, 500)]);
    });
    return { ok: false, error: message };
  }
}

/** Revierte manualmente un canje (cola de problemas del panel). */
export async function reverseRedemption(id: string, adminId: string, note: string) {
  return tx(async (t) => {
    const r = await t.one<any>("select * from redemptions where id = $1 for update", [id]);
    if (!r) throw notFound("redemption_not_found");
    if (r.status === "used" || r.status === "failed" || r.status === "expired") throw conflict("not_reversible", "Este canje ya no se puede revertir");
    const settings = await getSettings(t);
    await lockUser(t, r.user_id);
    await addLedger(t, { userId: r.user_id, amount: r.points, reason: "redemption_reversal", refType: "redemption_reversal", refId: id, expiresAt: expiryFor(settings), createdBy: adminId, note });
    await t.exec("update redemptions set status = 'failed', error = $2 where id = $1", [id, `Revertido por soporte: ${note}`]);
    if (r.shopify_discount_id) await shopify.deleteDiscount(r.shopify_discount_id).catch(() => {});
    return r;
  });
}
