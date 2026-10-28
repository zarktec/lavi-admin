import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ok } from "@/lib/http";

export const GET = adminHandle("points.approve", async () => {
  const rows = await db.many(
    `select a.id, a.user_id, u.email as user_email, a.amount, a.reason, a.created_at, r.email as requested_by_email
       from points_adjustments a join users u on u.id = a.user_id join admin_users r on r.id = a.requested_by
      where a.status = 'pending_approval' order by a.created_at`,
  );
  return ok({ adjustments: rows });
});
