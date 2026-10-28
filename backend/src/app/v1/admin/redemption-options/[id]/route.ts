import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { tx } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { ok, parseBody } from "@/lib/http";
import { optionSchema } from "@/lib/catalog";

// Los códigos ya emitidos no cambian: editar una opción solo afecta canjes futuros.
export const PATCH = adminHandle<{ id: string }>("redemptions.manage", async (req, { id }, a) => {
  const b = await parseBody(req, optionSchema);
  const row = await tx(async (t) => {
    const before = await t.one("select * from redemption_options where id = $1 for update", [id]);
    if (!before) throw notFound("option_not_found");
    const after = await t.one(
      `update redemption_options set name=$2, points_cost=$3, reward_type=$4, reward_value=$5, shopify_product_id=$6, combines_with=$7::jsonb, active=$8
        where id = $1 returning *`,
      [id, b.name, b.points_cost, b.reward_type, b.reward_value ?? null, b.shopify_product_id ?? null, JSON.stringify(b.combines_with), b.active],
    );
    await audit(t, a.admin.id, "redemption_option.update", "redemption_option", id, before, after);
    return after;
  });
  return ok(row);
});
