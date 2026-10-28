import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { db, tx } from "@/lib/db";
import { optionSchema } from "@/lib/catalog";
import { ok, parseBody } from "@/lib/http";

export const GET = adminHandle("redemptions.view", async () =>
  ok({ options: await db.many("select * from redemption_options order by active desc, points_cost") }),
);

export const POST = adminHandle("redemptions.manage", async (req, _p, a) => {
  const b = await parseBody(req, optionSchema);
  const row = await tx(async (t) => {
    const o = await t.one(
      `insert into redemption_options (name, points_cost, reward_type, reward_value, shopify_product_id, combines_with, active)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7) returning *`,
      [b.name, b.points_cost, b.reward_type, b.reward_value ?? null, b.shopify_product_id ?? null, JSON.stringify(b.combines_with), b.active],
    );
    await audit(t, a.admin.id, "redemption_option.create", "redemption_option", o!.id, null, o);
    return o;
  });
  return ok(row, 201);
});
