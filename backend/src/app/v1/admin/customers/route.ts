import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ok, parseQuery } from "@/lib/http";

/** Búsqueda por correo, teléfono, nombre o UID de tag. */
export const GET = adminHandle("customers.view", async (req) => {
  const { q } = parseQuery(req, z.object({ q: z.string().trim().min(3).max(120) }));
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = await db.many(
    `select u.id, u.email, u.name, u.phone, u.status, u.created_at,
            coalesce((select sum(amount) from points_ledger l where l.user_id = u.id), 0)::int as balance,
            (select count(*)::int from treatments t where t.user_id = u.id and t.status = 'active') as active_treatments
       from users u
      where u.email ilike $1 or u.name ilike $1 or u.phone ilike $1
         or exists (select 1 from tags t where t.claimed_by = u.id and t.uid = upper($2))
      order by u.created_at desc limit 25`,
    [like, q],
  );
  return ok({ customers: rows });
});
