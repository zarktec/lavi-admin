import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { db, tx } from "@/lib/db";
import { ok, parseBody } from "@/lib/http";

export const GET = adminHandle("catalog.view", async () => {
  const products = await db.many("select id, name, description, active, created_at from products order by name");
  const variants = await db.many(
    `select v.id, v.product_id, v.name, v.sku, v.shopify_variant_id, v.volume_ml, v.active,
            (select version from variant_configs c where c.variant_id = v.id and c.effective_from <= now() order by version desc limit 1) as current_version,
            (select count(*)::int from tags t where t.variant_id = v.id) as tags_total,
            (select count(*)::int from tags t where t.variant_id = v.id and t.status = 'unclaimed') as tags_unclaimed
       from product_variants v order by v.volume_ml nulls last, v.name`,
  );
  return ok({ products: products.map((p) => ({ ...p, variants: variants.filter((v) => v.product_id === p.id) })) });
});

const schema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(2000).nullish() });

export const POST = adminHandle("catalog.manage", async (req, _p, a) => {
  const b = await parseBody(req, schema);
  const row = await tx(async (t) => {
    const p = await t.one("insert into products (name, description) values ($1, $2) returning *", [b.name, b.description ?? null]);
    await audit(t, a.admin.id, "product.create", "product", p!.id, null, p);
    return p;
  });
  return ok(row, 201);
});
