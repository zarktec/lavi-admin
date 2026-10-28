import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { tx } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { ok, parseBody } from "@/lib/http";

const schema = z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().max(2000).nullish(), active: z.boolean().optional() });

export const PATCH = adminHandle<{ id: string }>("catalog.manage", async (req, { id }, a) => {
  const b = await parseBody(req, schema);
  const row = await tx(async (t) => {
    const before = await t.one("select * from products where id = $1 for update", [id]);
    if (!before) throw notFound("product_not_found");
    const after = await t.one(
      "update products set name = coalesce($2, name), description = case when $3 then $4 else description end, active = coalesce($5, active) where id = $1 returning *",
      [id, b.name ?? null, "description" in b, b.description ?? null, b.active ?? null],
    );
    await audit(t, a.admin.id, "product.update", "product", id, before, after);
    return after;
  });
  return ok(row);
});
