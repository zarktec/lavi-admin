import { db, tx, type Db } from "./db";
import type { ShopifyCustomer } from "./shopify";

/** Crea o actualiza la usuaria por shopify_customer_id y reconoce compras hechas como invitada con el mismo correo. */
export async function upsertUserFromShopify(c: ShopifyCustomer, opts: { consent?: boolean; timezone?: string } = {}, t: Db = db) {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || null;
  const user = await t.one<{ id: string; status: string }>(
    `insert into users (shopify_customer_id, email, name, phone, timezone, data_consent_at)
     values ($1, $2, $3, $4, coalesce($5, 'America/Bogota'), case when $6 then now() end)
     on conflict (shopify_customer_id) do update
       set email = excluded.email, name = coalesce(excluded.name, users.name), phone = coalesce(excluded.phone, users.phone),
           data_consent_at = coalesce(users.data_consent_at, excluded.data_consent_at)
     returning id, status`,
    [c.id, c.email, name, c.phone, opts.timezone ?? null, !!opts.consent],
  );
  await t.exec(
    `update shopify_orders set user_id = $1
      where user_id is null and (customer_gid = $2 or (email is not null and lower(email) = lower($3)))`,
    [user!.id, c.id, c.email ?? ""],
  );
  return user!;
}

/** Eliminación de cuenta (Apple y habeas data): anonimiza y conserva el libro de puntos por trazabilidad. */
export async function deleteAccount(userId: string) {
  await tx(async (t) => {
    await t.exec("update users set status = 'deleted', email = null, name = null, phone = null, shopify_customer_id = 'deleted:' || id where id = $1", [userId]);
    await t.exec("delete from devices where user_id = $1", [userId]);
    await t.exec("update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null", [userId]);
    await t.exec("update treatments set status = 'cancelled', finished_at = now() where user_id = $1 and status = 'active'", [userId]);
    await t.exec(
      "update doses set status = 'missed' where status = 'scheduled' and treatment_id in (select id from treatments where user_id = $1)",
      [userId],
    );
  });
}
