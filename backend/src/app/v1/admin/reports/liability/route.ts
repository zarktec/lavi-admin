import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ok } from "@/lib/http";
import { getSettings } from "@/lib/settings";

/** Pasivo de puntos: puntos vigentes sin redimir, valorados en pesos. */
export const GET = adminHandle("reports.view", async () => {
  const s = await getSettings(db);
  const r = await db.one<any>(
    `with b as (
       select user_id, sum(amount) as balance,
              coalesce(sum(amount) filter (where amount > 0 and expires_at is not null and expires_at <= now() + interval '30 days' and expires_at > now()), 0) as expiring
         from points_ledger group by user_id)
     select coalesce(sum(greatest(balance, 0)), 0)::bigint as points,
            count(*) filter (where balance > 0)::int as users_with_points,
            coalesce(sum(least(expiring, greatest(balance, 0))), 0)::bigint as expiring_30d
       from b`,
  );
  return ok({
    outstanding_points: Number(r.points),
    users_with_points: r.users_with_points,
    expiring_30d_points: Number(r.expiring_30d),
    point_value_cop: s.point_value_cop,
    outstanding_cop: Math.round(Number(r.points) * s.point_value_cop),
    expiring_30d_cop: Math.round(Number(r.expiring_30d) * s.point_value_cop),
  });
});
