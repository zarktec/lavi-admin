import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { ok, parseQuery } from "@/lib/http";

const schema = z.object({
  /** Correo, teléfono, nombre o UID de tag. Sin `q` se listan todas las clientas. */
  q: z.string().trim().max(120).optional(),
  status: z.enum(["active", "blocked", "deleted"]).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  page_size: z.coerce.number().int().min(5).max(100).default(25),
});

/** Lista paginada de clientas (más recientes primero), con búsqueda y filtro por estado opcionales. */
export const GET = adminHandle("customers.view", async (req) => {
  const { q, status, page, page_size } = parseQuery(req, schema);
  if (q && q.length < 3) throw badRequest("query_too_short", "La búsqueda necesita al menos 3 caracteres");

  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q.replace(/[%_]/g, "")}%`, q);
    where.push(
      `(u.email ilike $1 or u.name ilike $1 or u.phone ilike $1 or exists (select 1 from tags t where t.claimed_by = u.id and t.uid = upper($2)))`,
    );
  }
  if (status) {
    params.push(status);
    where.push(`u.status = $${params.length}`);
  }
  const filter = where.length ? `where ${where.join(" and ")}` : "";

  const total = (await db.one<{ n: number }>(`select count(*)::int as n from users u ${filter}`, params))!.n;
  const total_pages = Math.max(1, Math.ceil(total / page_size));
  const current = Math.min(page, total_pages);

  const rows = await db.many(
    `select u.id, u.email, u.name, u.phone, u.status, u.created_at,
            coalesce((select sum(amount) from points_ledger l where l.user_id = u.id), 0)::int as balance,
            (select count(*)::int from treatments t where t.user_id = u.id and t.status = 'active') as active_treatments
       from users u ${filter}
      order by u.created_at desc, u.id
      limit ${page_size} offset ${(current - 1) * page_size}`,
    params,
  );
  return ok({ customers: rows, page: current, page_size, total, total_pages });
});
