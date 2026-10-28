import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ok } from "@/lib/http";

/** Señales de fraude de los últimos 30 días. */
export const GET = adminHandle("reports.view", async () => {
  const [rejected, multiAccount, offline, clockSkew] = await Promise.all([
    db.many(
      `select reason, count(*)::int as scans, count(distinct user_id)::int as users from scans
        where result = 'rejected' and server_time > now() - interval '30 days' group by reason order by scans desc`,
    ),
    db.many(
      `select s.tag_uid, count(distinct s.user_id)::int as accounts, count(*)::int as attempts, max(s.server_time) as last_attempt
         from scans s where s.tag_uid is not null and s.user_id is not null and s.server_time > now() - interval '30 days'
        group by s.tag_uid having count(distinct s.user_id) > 1 order by accounts desc, attempts desc limit 100`,
    ),
    db.many(
      `select s.user_id, u.email, count(*)::int as scans, count(*) filter (where s.offline)::int as offline_scans
         from scans s join users u on u.id = s.user_id where s.server_time > now() - interval '30 days'
        group by s.user_id, u.email having count(*) filter (where s.offline) >= 5 and count(*) filter (where s.offline)::float / count(*) > 0.5
        order by offline_scans desc limit 100`,
    ),
    db.many(
      `select s.user_id, u.email, count(*)::int as scans, round(avg(extract(epoch from (s.server_time - s.device_time)) / 60))::int as avg_skew_minutes
         from scans s join users u on u.id = s.user_id
        where s.device_time is not null and s.server_time > now() - interval '30 days'
          and abs(extract(epoch from (s.server_time - s.device_time))) > 3600 and not s.offline
        group by s.user_id, u.email having count(*) >= 3 order by scans desc limit 100`,
    ),
  ]);
  return ok({ rejected_by_reason: rejected, tags_in_multiple_accounts: multiAccount, offline_anomalies: offline, device_clock_skew: clockSkew });
});
