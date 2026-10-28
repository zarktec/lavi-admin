import { db } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { envOpt } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Versión mínima, textos y ajustes globales que necesita la app. */
export const GET = handle(async () => {
  const s = await getSettings(db);
  return ok({
    min_app_version: s.min_app_version,
    notification_texts: s.notification_texts,
    settings: {
      point_value_cop: s.point_value_cop,
      min_points_to_redeem: s.min_points_to_redeem,
      points_expiration_days: s.points_expiration_days,
      offline_scan_max_hours: s.offline_scan_max_hours,
      allow_parallel_treatments: s.allow_parallel_treatments,
    },
    links: { ios_store_url: envOpt("IOS_STORE_URL"), android_store_url: envOpt("ANDROID_STORE_URL"), app_domain: envOpt("APP_DOMAIN") },
  });
});
