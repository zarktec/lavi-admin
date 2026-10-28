import { safeEqual } from "./crypto";
import { env } from "./env";
import { handle, ok } from "./http";
import { unauthorized } from "./errors";

/** Vercel Cron envía GET con `Authorization: Bearer $CRON_SECRET`. Aceptamos también POST para ejecución manual. */
export function cronRoute(job: () => Promise<unknown>) {
  const run = handle(async (req) => {
    const given = req.headers.get("authorization") ?? "";
    if (!safeEqual(given, `Bearer ${env("CRON_SECRET")}`)) throw unauthorized("invalid_cron_secret", "Secreto de cron inválido");
    return ok(await job());
  });
  return { GET: run, POST: run };
}
