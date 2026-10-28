import type { Db } from "./db";
import { ApiError } from "./errors";
import { addLedger, expiryFor, getBalance, lockUser } from "./points";
import { getSettings } from "./settings";

/** Aplica al libro un ajuste manual ya autorizado. */
export async function applyAdjustment(t: Db, adj: { id: string; user_id: string; amount: number; reason: string }, adminId: string) {
  await lockUser(t, adj.user_id);
  const settings = await getSettings(t);
  if (adj.amount < 0 && !settings.allow_negative_balance) {
    const balance = await getBalance(t, adj.user_id);
    if (balance + adj.amount < 0) throw new ApiError(409, "negative_balance", `El saldo (${balance}) no alcanza para restar ${-adj.amount} puntos`);
  }
  await addLedger(t, {
    userId: adj.user_id,
    amount: adj.amount,
    reason: "manual_adjustment",
    refType: "adjustment",
    refId: adj.id,
    expiresAt: adj.amount > 0 ? expiryFor(settings) : null,
    createdBy: adminId,
    note: adj.reason,
  });
}
