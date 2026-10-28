import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

/** Acceso mínimo a la base; funciona igual con el pool y dentro de una transacción. */
export interface Db {
  many<T extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<T[]>;
  one<T extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<T | null>;
  exec(text: string, params?: unknown[]): Promise<number>;
}

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: env("DATABASE_URL"), max: 5, idleTimeoutMillis: 10_000 });
  }
  return pool;
}

export async function closePool() {
  await pool?.end();
  pool = undefined;
}

function wrap(q: Pool | PoolClient): Db {
  return {
    async many(text, params) {
      return (await q.query(text, params as any[])).rows;
    },
    async one(text, params) {
      return (await q.query(text, params as any[])).rows[0] ?? null;
    },
    async exec(text, params) {
      return (await q.query(text, params as any[])).rowCount ?? 0;
    },
  };
}

export const db: Db = {
  many: (t, p) => wrap(getPool()).many(t, p),
  one: (t, p) => wrap(getPool()).one(t, p),
  exec: (t, p) => wrap(getPool()).exec(t, p),
};

export async function tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const out = await fn(wrap(client));
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
