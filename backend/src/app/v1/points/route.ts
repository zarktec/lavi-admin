import { requireUser } from "@/lib/auth-user";
import { db } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { getBalance, upcomingExpirations } from "@/lib/points";
import { getSettings } from "@/lib/settings";

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const settings = await getSettings(db);
  const balance = await getBalance(db, user.id);
  return ok({
    balance,
    value_cop: Math.round(balance * settings.point_value_cop),
    upcoming_expirations: await upcomingExpirations(db, user.id),
  });
});
