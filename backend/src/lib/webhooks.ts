import { db, tx } from "./db";
import { hmacBase64, safeEqual } from "./crypto";
import { env } from "./env";
import { ApiError, unauthorized } from "./errors";
import { numericId } from "./treatments";

/** Valida la firma HMAC de Shopify sobre el cuerpo crudo y registra el evento para no procesarlo dos veces. */
export async function receiveWebhook(req: Request, topic: string, process: (payload: any) => Promise<void>): Promise<Response> {
  const raw = await req.text();
  const sig = req.headers.get("x-shopify-hmac-sha256");
  if (!sig || !safeEqual(sig, hmacBase64(env("SHOPIFY_API_SECRET"), raw))) throw unauthorized("invalid_hmac", "Firma inválida");
  const webhookId = req.headers.get("x-shopify-event-id") ?? req.headers.get("x-shopify-webhook-id");
  if (!webhookId) throw new ApiError(400, "missing_webhook_id", "Falta el identificador del evento");

  await db.exec("insert into webhook_events (webhook_id, topic) values ($1, $2) on conflict do nothing", [webhookId, topic]);
  const ev = await db.one<{ processed: boolean }>("select processed from webhook_events where webhook_id = $1", [webhookId]);
  if (ev?.processed) return Response.json({ ok: true, duplicate: true });

  await process(JSON.parse(raw));
  await db.exec("update webhook_events set processed = true where webhook_id = $1", [webhookId]);
  return Response.json({ ok: true });
}

/** orders/paid: registra la compra y marca como usados los códigos de canje del pedido. */
export async function onOrderPaid(o: any) {
  const customerGid = o.customer?.id ? `gid://shopify/Customer/${o.customer.id}` : null;
  const email: string | null = o.email ?? o.customer?.email ?? null;
  const codes: string[] = (o.discount_codes ?? []).map((d: any) => String(d.code).toUpperCase());
  const items = (o.line_items ?? []).map((l: any) => ({
    variant_id: String(l.variant_id ?? ""),
    product_id: String(l.product_id ?? ""),
    quantity: l.quantity ?? 1,
  }));
  await tx(async (t) => {
    const user = await t.one<{ id: string }>(
      "select id from users where status = 'active' and (shopify_customer_id = $1 or ($2::text is not null and lower(email) = lower($2)))  limit 1",
      [customerGid, email],
    );
    await t.exec(
      `insert into shopify_orders (shopify_order_id, user_id, customer_gid, email, items, discount_codes, paid_at)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7)
       on conflict (shopify_order_id) do update set user_id = coalesce(shopify_orders.user_id, excluded.user_id),
         items = excluded.items, discount_codes = excluded.discount_codes, paid_at = excluded.paid_at`,
      [String(o.id), user?.id ?? null, customerGid, email, JSON.stringify(items), codes, o.processed_at ?? o.created_at ?? new Date().toISOString()],
    );
    if (codes.length) {
      await t.exec("update redemptions set status = 'used', used_at = now() where upper(code) = any($1) and status = 'issued'", [codes]);
    }
  });
}

/** refunds/create: bloquea los tags asociados al pedido (y cancela su tratamiento activo). */
export async function onRefundCreated(r: any) {
  const orderId = String(r.order_id);
  const refunded = new Set<string>((r.refund_line_items ?? []).map((l: any) => String(l.line_item?.variant_id ?? "")).filter(Boolean));
  await tx(async (t) => {
    const tags = await t.many<{ uid: string; shopify_variant_id: string | null }>(
      `select tg.uid, v.shopify_variant_id from tags tg join product_variants v on v.id = tg.variant_id
        where tg.shopify_order_id = $1 and tg.status <> 'blocked'`,
      [orderId],
    );
    for (const tag of tags) {
      // Si la devolución lista líneas, solo se bloquean los tags de esas presentaciones
      if (refunded.size && !refunded.has(numericId(tag.shopify_variant_id))) continue;
      await t.exec("update tags set status = 'blocked', blocked_reason = 'refund' where uid = $1", [tag.uid]);
      await t.exec(
        "update treatments set status = 'cancelled', finished_at = now() where tag_uid = $1 and status = 'active'",
        [tag.uid],
      );
    }
  });
}

/** customers/update: sincroniza correo y nombre. */
export async function onCustomerUpdate(c: any) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
  await db.exec(
    `update users set email = coalesce($2, email), name = coalesce($3, name), phone = coalesce($4, phone)
      where shopify_customer_id = $1 and status = 'active'`,
    [`gid://shopify/Customer/${c.id}`, c.email ?? null, name, c.phone ?? null],
  );
}
