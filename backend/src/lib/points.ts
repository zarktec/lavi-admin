import type { Db } from "./db";
import type { Settings } from "./settings";

export interface CreditInput {
  userId: string;
  amount: number; // positivo suma, negativo resta
  reason: string;
  refType: string;
  refId: string;
  expiresAt?: Date | null;
  createdBy?: string | null;
  note?: string | null;
}

/** El libro se escribe solo aquí. Devuelve false si el movimiento ya existía (idempotencia). */
export async function addLedger(db: Db, m: CreditInput): Promise<boolean> {
  const n = await db.exec(
    `insert into points_ledger (user_id, amount, reason, reference_type, reference_id, expires_at, created_by, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (reference_type, reference_id) where reference_type is not null do nothing`,
    [m.userId, m.amount, m.reason, m.refType, m.refId, m.expiresAt ?? null, m.createdBy ?? null, m.note ?? null],
  );
  return n > 0;
}

export function expiryFor(settings: Settings, from = new Date()): Date | null {
  if (!settings.points_expiration_days) return null;
  return new Date(from.getTime() + settings.points_expiration_days * 86_400_000);
}

export async function getBalance(db: Db, userId: string): Promise<number> {
  const r = await db.one<{ b: string }>("select coalesce(sum(amount), 0) as b from points_ledger where user_id = $1", [userId]);
  return Number(r!.b);
}

/** Bloquea la fila de la usuaria para serializar movimientos de puntos concurrentes. */
export async function lockUser(db: Db, userId: string): Promise<void> {
  await db.one("select id from users where id = $1 for update", [userId]);
}

/** Abona puntos de una dosis/activación respetando el tope por frasco. Devuelve los puntos realmente acreditados. */
export async function awardForTreatment(
  db: Db,
  settings: Settings,
  args: {
    userId: string;
    treatmentId: string;
    amount: number;
    reason: string;
    refType: string;
    refId: string;
    cap: number | null;
  },
): Promise<number> {
  if (args.amount <= 0) return 0;
  const t = await db.one<{ points_earned: number }>("select points_earned from treatments where id = $1 for update", [
    args.treatmentId,
  ]);
  const room = args.cap == null ? args.amount : Math.max(0, args.cap - (t?.points_earned ?? 0));
  const grant = Math.min(args.amount, room);
  if (grant <= 0) return 0;
  const inserted = await addLedger(db, {
    userId: args.userId,
    amount: grant,
    reason: args.reason,
    refType: args.refType,
    refId: args.refId,
    expiresAt: expiryFor(settings),
  });
  if (!inserted) return 0;
  await db.exec("update treatments set points_earned = points_earned + $2 where id = $1", [args.treatmentId, grant]);
  return grant;
}

/**
 * Vence puntos por antigüedad (FIFO): los débitos consumen primero los abonos más viejos;
 * lo que sobra de un abono vencido se descuenta con un movimiento 'expiration'.
 */
export async function expireUserPoints(db: Db, userId: string, now = new Date()): Promise<number> {
  const rows = await db.many<{ id: string; amount: number; expires_at: Date | null; reason: string }>(
    "select id, amount, expires_at, reason from points_ledger where user_id = $1 order by created_at, id",
    [userId],
  );
  let debits = rows.filter((r) => r.amount < 0 && r.reason !== "expiration").reduce((s, r) => s - r.amount, 0);
  let expired = 0;
  for (const credit of rows.filter((r) => r.amount > 0)) {
    const used = Math.min(credit.amount, debits);
    debits -= used;
    const remaining = credit.amount - used;
    if (credit.expires_at && credit.expires_at <= now && remaining > 0) {
      const inserted = await addLedger(db, {
        userId,
        amount: -remaining,
        reason: "expiration",
        refType: "expiration",
        refId: String(credit.id),
      });
      if (inserted) expired += remaining;
    }
  }
  return expired;
}

/** Puntos vigentes que vencerán, agrupados por fecha (consumo FIFO igual que en el vencimiento). */
export async function upcomingExpirations(db: Db, userId: string, now = new Date()) {
  const rows = await db.many<{ id: string; amount: number; expires_at: Date | null; reason: string }>(
    "select id, amount, expires_at, reason from points_ledger where user_id = $1 order by created_at, id",
    [userId],
  );
  let debits = rows.filter((r) => r.amount < 0 && r.reason !== "expiration").reduce((s, r) => s - r.amount, 0);
  const out = new Map<string, number>();
  for (const credit of rows.filter((r) => r.amount > 0)) {
    const used = Math.min(credit.amount, debits);
    debits -= used;
    const remaining = credit.amount - used;
    if (credit.expires_at && credit.expires_at > now && remaining > 0) {
      const day = credit.expires_at.toISOString().slice(0, 10);
      out.set(day, (out.get(day) ?? 0) + remaining);
    }
  }
  return [...out.entries()].sort().map(([date, amount]) => ({ date, amount }));
}
