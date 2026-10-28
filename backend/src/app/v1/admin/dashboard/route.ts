import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ok } from "@/lib/http";
import { getSettings } from "@/lib/settings";

export const GET = adminHandle("dashboard.view", async () => {
  const [kpi] = await db.many(
    `select
       (select count(distinct user_id)::int from treatments where status = 'active') as active_users,
       (select count(*)::int from treatments where status = 'active') as active_treatments,
       (select coalesce(sum(amount) filter (where amount > 0 and reason <> 'redemption_reversal'), 0)::int from points_ledger where created_at > now() - interval '30 days') as points_issued_30d,
       (select coalesce(-sum(amount), 0)::int from points_ledger where reason = 'redemption' and created_at > now() - interval '30 days') as points_redeemed_30d,
       (select count(*) filter (where status = 'on_time')::float / nullif(count(*) filter (where status in ('on_time','late','missed')), 0)
          from doses where window_end > now() - interval '30 days' and window_end < now()) as adherence_30d,
       (select count(*)::int from scans where result = 'rejected' and server_time > now() - interval '7 days') as rejected_scans_7d,
       (select count(*)::int from redemptions where status = 'failed' or (status = 'pending' and created_at < now() - interval '2 minutes')) as redemption_problems,
       (select count(*)::int from points_adjustments where status = 'pending_approval') as pending_adjustments`,
  );
  const alerts = await db.many(
    `select reason, count(*)::int as n from scans where result = 'rejected' and server_time > now() - interval '7 days' group by reason order by n desc`,
  );
  const settings = await getSettings(db).catch(() => null);
  const balance = await db.one<{ b: string }>("select coalesce(sum(amount), 0) as b from points_ledger");
  return ok({
    ...kpi,
    adherence_30d: kpi.adherence_30d == null ? null : Number(kpi.adherence_30d),
    rejected_by_reason: alerts,
    points_outstanding: Number(balance!.b),
    points_outstanding_cop: settings ? Math.round(Number(balance!.b) * settings.point_value_cop) : null,
  });
});
