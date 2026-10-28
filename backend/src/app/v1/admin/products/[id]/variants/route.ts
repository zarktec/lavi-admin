import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { tx } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { variantSchema } from "@/lib/catalog";
import { ok, parseBody } from "@/lib/http";

export const POST = adminHandle<{ id: string }>("catalog.manage", async (req, { id }, a) => {
  const b = await parseBody(req, variantSchema);
  const row = await tx(async (t) => {
    if (!(await t.one("select 1 from products where id = $1", [id]))) throw notFound("product_not_found");
    if (b.sku && (await t.one("select 1 from product_variants where sku = $1", [b.sku]))) throw conflict("sku_taken", "Ya existe una presentación con ese SKU");
    const v = await t.one(
      "insert into product_variants (product_id, name, sku, shopify_variant_id, volume_ml) values ($1, $2, $3, $4, $5) returning *",
      [id, b.name, b.sku ?? null, b.shopify_variant_id ?? null, b.volume_ml ?? null],
    );
    await audit(t, a.admin.id, "variant.create", "variant", v!.id, null, v);
    return v;
  });
  return ok(row, 201);
});
