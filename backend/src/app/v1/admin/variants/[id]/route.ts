import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { tx } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { ok, parseBody } from "@/lib/http";

const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sku: z.string().trim().max(80).nullish(),
  shopify_variant_id: z.string().trim().max(120).nullish(),
  volume_ml: z.number().int().positive().nullish(),
  active: z.boolean().optional(),
});

export const PATCH = adminHandle<{ id: string }>("catalog.manage", async (req, { id }, a) => {
  const b = await parseBody(req, schema);
  const row = await tx(async (t) => {
    const before = await t.one("select * from product_variants where id = $1 for update", [id]);
    if (!before) throw notFound("variant_not_found");
    const merged = { ...before, ...b };
    const after = await t.one(
      "update product_variants set name = $2, sku = $3, shopify_variant_id = $4, volume_ml = $5, active = $6 where id = $1 returning *",
      [id, merged.name, merged.sku ?? null, merged.shopify_variant_id ?? null, merged.volume_ml ?? null, merged.active],
    );
    await audit(t, a.admin.id, "variant.update", "variant", id, before, after);
    return after;
  });
  return ok(row);
});
