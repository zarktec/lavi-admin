import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ok, parseQuery } from "@/lib/http";

const q = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().optional(),
  action: z.string().max(80).optional(),
  entity: z.string().max(80).optional(),
  admin: z.string().uuid().optional(),
});

/** Bitácora de todas las acciones con valor anterior y nuevo. */
export const GET = adminHandle("audit.view", async (req) => {
  const f = parseQuery(req, q);
  const rows = await db.many(
    `select l.id, l.action, l.entity, l.entity_id, l.before, l.after, l.created_at, a.email as admin_email, a.name as admin_name
       from audit_log l left join admin_users a on a.id = l.admin_user_id
      where ($1::bigint is null or l.id < $1) and ($2::text is null or l.action ilike $2 || '%')
        and ($3::text is null or l.entity = $3) and ($4::uuid is null or l.admin_user_id = $4)
      order by l.id desc limit $5`,
    [f.before ?? null, f.action ?? null, f.entity ?? null, f.admin ?? null, f.limit],
  );
  return ok({ entries: rows, next_before: rows.length === f.limit ? rows[rows.length - 1].id : null });
});
