import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { ok, parseQuery } from "@/lib/http";

const schema = z.object({
  /** UID (o parte de él, mínimo 3 caracteres). */
  q: z.string().trim().max(20).optional(),
  status: z.enum(["unclaimed", "claimed", "blocked"]).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  page_size: z.coerce.number().int().min(5).max(100).default(25),
});

/** Tags de un lote, paginados, con su estado y la clienta que los reclamó. */
export const GET = adminHandle<{ id: string }>("tags.view", async (req, { id }) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("batch_not_found", "Lote no encontrado");
  const { q, status, page, page_size } = parseQuery(req, schema);
  if (q && q.length < 3) throw badRequest("query_too_short", "La búsqueda necesita al menos 3 caracteres");

  const batch = await db.one(
    `select b.id, b.batch_code, b.status, b.imported_at, b.variant_id, v.name as variant_name, p.name as product_name,
            count(t.uid)::int as tags_total,
            count(t.uid) filter (where t.status = 'claimed')::int as tags_claimed,
            count(t.uid) filter (where t.status = 'blocked')::int as tags_blocked
       from tag_batches b join product_variants v on v.id = b.variant_id join products p on p.id = v.product_id
       left join tags t on t.batch_id = b.id where b.id = $1 group by b.id, v.name, p.name`,
    [id],
  );
  if (!batch) throw notFound("batch_not_found", "Lote no encontrado");

  const params: unknown[] = [id];
  const where = ["t.batch_id = $1"];
  if (q) {
    params.push(`%${q.replace(/[%_]/g, "").toUpperCase()}%`);
    where.push(`t.uid like $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`t.status = $${params.length}`);
  }
  const filter = where.join(" and ");
  const total = (await db.one<{ n: number }>(`select count(*)::int as n from tags t where ${filter}`, params))!.n;
  const total_pages = Math.max(1, Math.ceil(total / page_size));
  const current = Math.min(page, total_pages);

  const tags = await db.many(
    `select t.uid, t.status, t.last_counter, t.claimed_at, t.blocked_reason, u.id as user_id, u.email as user_email, u.name as user_name
       from tags t left join users u on u.id = t.claimed_by
      where ${filter} order by t.uid limit ${page_size} offset ${(current - 1) * page_size}`,
    params,
  );
  return ok({ batch, tags, page: current, page_size, total, total_pages });
});
