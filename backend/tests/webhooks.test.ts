import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as ordersPaid } from "@/app/webhooks/shopify/orders-paid/route";
import { POST as refundsCreate } from "@/app/webhooks/shopify/refunds-create/route";
import { POST as customersUpdate } from "@/app/webhooks/shopify/customers-update/route";
import { POST as closeDosesCron, GET as closeDosesGet } from "@/app/cron/close-doses/route";
import { POST as scansPOST } from "@/app/v1/scans/route";
import { POST as treatmentsPOST } from "@/app/v1/treatments/route";
import { hmacBase64 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { upsertUserFromShopify } from "@/lib/users";
import { call, closePool, json, makeUser, realTime, resetDb, seedCatalog, setNow, tagUrl } from "./helpers";

const secret = "shopify-secret";

function hook(handler: Function, body: unknown, id: string, sigOverride?: string) {
  const raw = JSON.stringify(body);
  return call(handler, "POST", "/webhooks", {
    raw,
    headers: { "x-shopify-hmac-sha256": sigOverride ?? hmacBase64(secret, raw), "x-shopify-event-id": id },
  }).then(json);
}

beforeEach(async () => {
  realTime();
  await resetDb();
});
afterAll(closePool);

describe("webhooks de Shopify", () => {
  it("rechaza firmas inválidas y no procesa dos veces el mismo evento", async () => {
    expect((await hook(ordersPaid, { id: 1 }, "e1", "firma-falsa")).status).toBe(401);
    const order = { id: 9001, email: "ana@example.com", customer: { id: 42 }, line_items: [{ variant_id: 555, product_id: 1, quantity: 1 }], discount_codes: [], processed_at: "2026-03-01T10:00:00Z" };
    expect((await hook(ordersPaid, order, "e2")).body).toEqual({ ok: true });
    expect((await hook(ordersPaid, order, "e2")).body).toEqual({ ok: true, duplicate: true });
    expect(await db.one("select count(*)::int as n from shopify_orders")).toMatchObject({ n: 1 });
  });

  it("orders/paid marca como usados los códigos de canje", async () => {
    const ana = await makeUser();
    const opt = await db.one<{ id: string }>("insert into redemption_options (name, points_cost, reward_type, reward_value) values ('x', 100, 'percentage', 10) returning id");
    await db.exec("insert into redemptions (user_id, option_id, points, code, status, expires_at) values ($1, $2, 100, 'LV-ABCD1234', 'issued', now() + interval '3 days')", [ana.id, opt!.id]);
    await hook(ordersPaid, { id: 9002, email: "x@y.co", line_items: [], discount_codes: [{ code: "lv-abcd1234" }] }, "e3");
    expect(await db.one("select status from redemptions")).toMatchObject({ status: "used" });
  });

  it("una compra como invitada se reconoce al entrar con el mismo correo", async () => {
    await hook(ordersPaid, { id: 9003, email: "Invitada@Example.com", line_items: [{ variant_id: 555 }], discount_codes: [] }, "e4");
    expect(await db.one("select user_id from shopify_orders")).toMatchObject({ user_id: null });
    const u = await upsertUserFromShopify({ id: "gid://shopify/Customer/77", email: "invitada@example.com", firstName: "In", lastName: "Vitada", phone: null });
    expect(await db.one("select user_id from shopify_orders")).toMatchObject({ user_id: u.id });
  });

  it("refunds/create bloquea los tags del pedido y cancela su tratamiento", async () => {
    await seedCatalog();
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z");
    await hook(ordersPaid, { id: 9004, email: "ana@example.com", line_items: [{ variant_id: 555 }], discount_codes: [] }, "e5");
    await db.exec("update shopify_orders set user_id = $1", [ana.id]);
    const s = await json(await call(scansPOST, "POST", "/v1/scans", { token: ana.token, body: { tag_url: tagUrl("04A1B2C3D4E5F6", 0) } }));
    const t = await json(await call(treatmentsPOST, "POST", "/v1/treatments", { token: ana.token, body: { activation_token: s.body.activation_token } }));
    expect(t.status).toBe(201);
    expect(await db.one("select shopify_order_id from tags")).toMatchObject({ shopify_order_id: "9004" }); // vinculado al pedido

    await hook(refundsCreate, { id: 1, order_id: 9004, refund_line_items: [{ line_item: { variant_id: 555 } }] }, "e6");
    expect(await db.one("select status, blocked_reason from tags")).toMatchObject({ status: "blocked", blocked_reason: "refund" });
    expect(await db.one("select status from treatments")).toMatchObject({ status: "cancelled" });
    const after = await json(await call(scansPOST, "POST", "/v1/scans", { token: ana.token, body: { tag_url: tagUrl("04A1B2C3D4E5F6", 1) } }));
    expect(after.body).toEqual({ result: "rejected", reason: "blocked" });
  });

  it("customers/update sincroniza correo y nombre", async () => {
    const ana = await makeUser();
    const gid = (await db.one<{ shopify_customer_id: string }>("select shopify_customer_id from users"))!.shopify_customer_id;
    await hook(customersUpdate, { id: gid.split("/").pop(), email: "nuevo@example.com", first_name: "Ana", last_name: "Gómez" }, "e7");
    expect(await db.one("select email, name from users where id = $1", [ana.id])).toEqual({ email: "nuevo@example.com", name: "Ana Gómez" });
  });
});

describe("cron", () => {
  it("exige CRON_SECRET", async () => {
    expect((await call(closeDosesGet, "GET", "/cron/close-doses")).status).toBe(401);
    const ok = await call(closeDosesCron, "POST", "/cron/close-doses", { headers: { authorization: "Bearer cron-secret" } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ closed: 0 });
  });
});
