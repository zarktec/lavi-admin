import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { tx } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { ok, parseBody } from "@/lib/http";

/** Bloquea o desbloquea todo un lote (los tags del lote dejan de dar puntos y de activarse). */
export const POST = adminHandle<{ id: string }>("tags.manage", async (req, { id }, a) => {
  const b = await parseBody(req, z.object({ blocked: z.boolean(), reason: z.string().trim().min(3).max(300) }));
  const row = await tx(async (t) => {
    const before = await t.one("select * from tag_batches where id = $1 for update", [id]);
    if (!before) throw notFound("batch_not_found");
    const after = await t.one("update tag_batches set status = $2 where id = $1 returning *", [id, b.blocked ? "blocked" : "active"]);
    await audit(t, a.admin.id, b.blocked ? "tag_batch.block" : "tag_batch.unblock", "tag_batch", id, before, { ...after, reason: b.reason });
    return after;
  });
  return ok(row);
});
