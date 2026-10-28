import { z } from "zod";
import { requireUser } from "@/lib/auth-user";
import { db } from "@/lib/db";
import { handle, ok, parseQuery } from "@/lib/http";

const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), before: z.coerce.number().int().optional() });

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const { limit, before } = parseQuery(req, q);
  const rows = await db.many(
    `select id, amount, reason, reference_type, expires_at, created_at from points_ledger
      where user_id = $1 and ($2::bigint is null or id < $2) order by id desc limit $3`,
    [user.id, before ?? null, limit],
  );
  return ok({ entries: rows, next_before: rows.length === limit ? rows[rows.length - 1].id : null });
});
