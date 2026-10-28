import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as redeemPOST } from "@/app/v1/redemptions/route";
import { GET as pointsGET } from "@/app/v1/points/route";
import { db } from "@/lib/db";
import { expirePoints, expireRedemptions, reconcileRedemptions } from "@/lib/jobs";
import { addLedger } from "@/lib/points";
import { call, closePool, json, makeUser, mockShopify, realTime, resetDb, setNow, setSetting, type MockShopify } from "./helpers";

let shop: MockShopify;
let optionId: string;

const balanceOf = async (token: string) => (await json(await call(pointsGET, "GET", "/v1/points", { token }))).body.balance;
const redeem = (token: string, key: string, option = optionId) =>
  call(redeemPOST, "POST", "/v1/redemptions", { token, headers: { "idempotency-key": key }, body: { option_id: option } }).then(json);

async function userWithPoints(points: number) {
  const u = await makeUser();
  await addLedger(db, { userId: u.id, amount: points, reason: "test", refType: "test", refId: u.id });
  return u;
}

beforeEach(async () => {
  realTime();
  await resetDb();
  shop = mockShopify();
  const o = await db.one<{ id: string }>(
    "insert into redemption_options (name, points_cost, reward_type, reward_value) values ('10% de descuento', 100, 'percentage', 10) returning id",
  );
  optionId = o!.id;
});
afterAll(closePool);

describe("canje de puntos", () => {
  it("descuenta, crea el código en Shopify restringido a la clienta y es idempotente", async () => {
    const ana = await userWithPoints(150);
    const a = await redeem(ana.token, "key-00000001");
    expect(a.status).toBe(201);
    expect(a.body.code).toMatch(/^LV-[A-Z0-9]{8}$/);
    expect(await balanceOf(ana.token)).toBe(50);
    expect(shop.discounts).toHaveLength(1);
    expect(shop.discounts[0]).toMatchObject({ rewardType: "percentage", rewardValue: 10, code: a.body.code });
    expect(shop.discounts[0].customerGid).toMatch(/^gid:\/\/shopify\/Customer\//);

    const b = await redeem(ana.token, "key-00000001");
    expect(b).toEqual(a);
    expect(await balanceOf(ana.token)).toBe(50);
    expect(shop.discounts).toHaveLength(1);
  });

  it("dos solicitudes simultáneas con la misma llave descuentan una sola vez", async () => {
    const ana = await userWithPoints(250);
    const [x, y] = await Promise.all([redeem(ana.token, "key-parallel-1"), redeem(ana.token, "key-parallel-1")]);
    // La segunda llega mientras la primera procesa (409) o ya terminada (devuelve lo guardado, 201)
    expect(x.status).toBe(201);
    expect([201, 409]).toContain(y.status);
    expect(await balanceOf(ana.token)).toBe(150);
  });

  it("canjes distintos en paralelo no dejan el saldo en negativo", async () => {
    const ana = await userWithPoints(150);
    const res = await Promise.all([redeem(ana.token, "key-aaaaaaaa"), redeem(ana.token, "key-bbbbbbbb"), redeem(ana.token, "key-cccccccc")]);
    expect(res.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await balanceOf(ana.token)).toBe(50);
  });

  it("rechaza saldo insuficiente y el mínimo para redimir", async () => {
    const ana = await userWithPoints(60);
    expect((await redeem(ana.token, "key-00000002")).body.error.code).toBe("below_minimum");
    await setSetting({ min_points_to_redeem: 10 });
    expect((await redeem(ana.token, "key-00000003")).body.error.code).toBe("insufficient_points");
    expect(await balanceOf(ana.token)).toBe(60);
  });

  it("exige Idempotency-Key", async () => {
    const ana = await userWithPoints(150);
    const r = await json(await call(redeemPOST, "POST", "/v1/redemptions", { token: ana.token, body: { option_id: optionId } }));
    expect(r.status).toBe(400);
  });

  it("si Shopify falla devuelve los puntos con un movimiento de reversa", async () => {
    const ana = await userWithPoints(150);
    shop.failNext = true;
    const r = await redeem(ana.token, "key-00000004");
    expect(r.status).toBe(502);
    expect(await balanceOf(ana.token)).toBe(150);
    const reasons = (await db.many("select reason, amount from points_ledger where user_id = $1 order by id", [ana.id])).map((x) => `${x.reason}:${x.amount}`);
    expect(reasons).toEqual(["test:150", "redemption:-100", "redemption_reversal:100"]);
    expect(await db.one("select status from redemptions")).toMatchObject({ status: "failed" });
    // la misma llave devuelve el mismo error sin volver a cobrar
    expect((await redeem(ana.token, "key-00000004")).status).toBe(502);
    expect(await balanceOf(ana.token)).toBe(150);
  });
});

describe("tareas de canjes y vencimiento de puntos", () => {
  it("reconcilia canjes a medias (completa o revierte)", async () => {
    const ana = await userWithPoints(300);
    // Proceso interrumpido: puntos descontados y canje pendiente
    const r = await db.one<{ id: string }>("insert into redemptions (user_id, option_id, points, code, status, created_at) values ($1, $2, 100, 'LV-PENDING1', 'pending', now() - interval '10 minutes') returning id", [ana.id, optionId]);
    await addLedger(db, { userId: ana.id, amount: -100, reason: "redemption", refType: "redemption", refId: r!.id });
    expect(await reconcileRedemptions()).toEqual({ completed: 1, reversed: 0 });
    expect(await db.one("select status, code from redemptions")).toMatchObject({ status: "issued", code: "LV-PENDING1" });

    const r2 = await db.one<{ id: string }>("insert into redemptions (user_id, option_id, points, code, status, created_at) values ($1, $2, 100, 'LV-PENDING2', 'pending', now() - interval '10 minutes') returning id", [ana.id, optionId]);
    await addLedger(db, { userId: ana.id, amount: -100, reason: "redemption", refType: "redemption", refId: r2!.id });
    shop.failNext = true;
    expect(await reconcileRedemptions()).toEqual({ completed: 0, reversed: 1 });
    expect(await balanceOf(ana.token)).toBe(200);
  });

  it("vence códigos sin usar y devuelve puntos según el parámetro global", async () => {
    const ana = await userWithPoints(0 + 100);
    await db.exec("insert into redemptions (user_id, option_id, points, code, status, expires_at) values ($1, $2, 100, 'LV-OLD', 'issued', now() - interval '1 day')", [ana.id, optionId]);
    await setSetting({ refund_points_on_expired_code: false });
    expect(await expireRedemptions()).toEqual({ expired: 1 });
    expect(await balanceOf(ana.token)).toBe(100);

    await db.exec("insert into redemptions (user_id, option_id, points, code, status, expires_at) values ($1, $2, 100, 'LV-OLD2', 'issued', now() - interval '1 day')", [ana.id, optionId]);
    await setSetting({ refund_points_on_expired_code: true });
    await expireRedemptions();
    expect(await balanceOf(ana.token)).toBe(200);
  });

  it("vence puntos por antigüedad (FIFO) y solo una vez", async () => {
    const ana = await makeUser();
    setNow("2026-01-01T00:00:00Z");
    await addLedger(db, { userId: ana.id, amount: 100, reason: "a", refType: "t", refId: "1", expiresAt: new Date("2026-02-01T00:00:00Z") });
    await addLedger(db, { userId: ana.id, amount: 100, reason: "b", refType: "t", refId: "2", expiresAt: new Date("2026-06-01T00:00:00Z") });
    setNow("2026-01-15T00:00:00Z");
    await addLedger(db, { userId: ana.id, amount: -130, reason: "redemption", refType: "t", refId: "3" }); // consume los 100 más viejos y 30 del segundo
    setNow("2026-03-01T00:00:00Z");
    expect(await expirePoints()).toMatchObject({ expired: 0 }); // el primero ya se consumió por completo
    setNow("2026-07-01T00:00:00Z");
    expect(await expirePoints()).toMatchObject({ expired: 70 });
    expect(await expirePoints()).toMatchObject({ expired: 0 });
    expect(await balanceOf(ana.token)).toBe(0);
  });
});
