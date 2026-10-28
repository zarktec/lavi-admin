import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { closePool, db } from "@/lib/db";
import { signAccessToken } from "@/lib/auth-user";
import { saveSettings, type Settings } from "@/lib/settings";
import { buildSunUrl, loadMasterKeys } from "@/lib/ntag";
import { setShopify, type ShopifyClient } from "@/lib/shopify";

export const DOMAIN = "https://app.example.com";
export const master = () => loadMasterKeys()[0];

const KEEP = new Set(["permissions", "roles", "role_permissions", "schema_migrations"]);

export async function resetDb() {
  const tables = await db.many<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
  const names = tables.map((t) => t.tablename).filter((t) => !KEEP.has(t));
  await db.exec(`truncate ${names.join(", ")} restart identity cascade`);
  // Los roles y permisos son datos de referencia: se restauran a su estado inicial
  await db.exec("delete from role_permissions where role_id in (select id from roles where not is_system)");
  await db.exec("delete from roles where not is_system");
  await db.exec("update roles set max_adjustment = 500 where name = 'Servicio al cliente'");
  const seed = JSON.parse(readFileSync(join(process.cwd(), "seed", "settings.seed.json"), "utf8"));
  await saveSettings(db, seed, null);
}

export async function setSetting(patch: Partial<Settings>) {
  await saveSettings(db, patch, null);
}

export { closePool };

export const setNow = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};
export const realTime = () => vi.useRealTimers();

export interface ConfigOverrides {
  doses_per_day?: number;
  default_reminder_times?: string[];
  duration_days?: number;
  points_per_dose?: number;
  missed_dose_penalty?: number;
  late_dose_avoids_penalty?: boolean;
  max_points_per_treatment?: number | null;
  welcome_points?: number;
  schedule_change_max_count?: number;
  schedule_change_min_notice_hours?: number;
  streak_rules?: { streak_length: number; bonus_points: number; repeatable: boolean }[];
}

/** Producto + presentación + configuración publicada + lote con tags. Devuelve ids y UIDs. */
export async function seedCatalog(opts: { config?: ConfigOverrides; tags?: string[] } = {}) {
  const c = {
    doses_per_day: 1, default_reminder_times: ["08:00"], duration_days: 3, points_per_dose: 10, missed_dose_penalty: 5,
    late_dose_avoids_penalty: false, max_points_per_treatment: null, welcome_points: 20,
    schedule_change_max_count: 2, schedule_change_min_notice_hours: 2,
    streak_rules: [{ streak_length: 2, bonus_points: 5, repeatable: false }],
    ...opts.config,
  };
  const p = await db.one<{ id: string }>("insert into products (name) values ('Tónico') returning id");
  const v = await db.one<{ id: string }>(
    "insert into product_variants (product_id, name, sku, shopify_variant_id, volume_ml) values ($1, '100 ml', 'TON-100', 'gid://shopify/ProductVariant/555', 100) returning id",
    [p!.id],
  );
  const cfg = await db.one<{ id: string }>(
    `insert into variant_configs (variant_id, version, effective_from, doses_per_day, default_reminder_times, window_minutes_before, window_minutes_after,
       duration_days, points_per_dose, missed_dose_penalty, late_dose_avoids_penalty, max_points_per_treatment, welcome_points, reminder_nudges,
       backup_push_enabled, schedule_change_min_notice_hours, schedule_change_max_count, schedule_change_period_days, repurchase_reminder_days)
     values ($1, 1, '2020-01-01', $2, $3, 60, 60, $4, $5, $6, $7, $8, $9, '[0,15]', true, $10, $11, 30, 2) returning id`,
    [v!.id, c.doses_per_day, c.default_reminder_times, c.duration_days, c.points_per_dose, c.missed_dose_penalty, c.late_dose_avoids_penalty,
     c.max_points_per_treatment, c.welcome_points, c.schedule_change_min_notice_hours, c.schedule_change_max_count],
  );
  for (const r of c.streak_rules) {
    await db.exec("insert into streak_rules (config_id, streak_length, bonus_points, repeatable) values ($1, $2, $3, $4)", [cfg!.id, r.streak_length, r.bonus_points, r.repeatable]);
  }
  const batch = await db.one<{ id: string }>("insert into tag_batches (variant_id, batch_code) values ($1, 'L1') returning id", [v!.id]);
  const uids = opts.tags ?? ["04A1B2C3D4E5F6"];
  for (const uid of uids) {
    await db.exec("insert into tags (uid, batch_id, variant_id, key_ref) values ($1, $2, $3, 'v1')", [uid, batch!.id, v!.id]);
  }
  return { productId: p!.id, variantId: v!.id, configId: cfg!.id, batchId: batch!.id, uids };
}

export async function makeUser(email = "ana@example.com", tz = "America/Bogota") {
  const u = await db.one<{ id: string }>(
    "insert into users (shopify_customer_id, email, name, timezone, data_consent_at) values ($1, $2, 'Ana', $3, now()) returning id",
    [`gid://shopify/Customer/${Math.floor(Math.random() * 1e9)}`, email, tz],
  );
  return { id: u!.id, token: await signAccessToken(u!.id) };
}

export const tagUrl = (uid: string, counter: number) => buildSunUrl({ baseUrl: DOMAIN, uid, counter, master: master() });

export function call(handler: Function, method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string>; params?: Record<string, string>; cookie?: string; raw?: string } = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined || opts.raw !== undefined) headers["content-type"] = "application/json";
  const req = new Request(`http://localhost${path}`, { method, headers, body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
  return handler(req, { params: Promise.resolve(opts.params ?? {}) }) as Promise<Response>;
}

export const json = async (r: Response) => ({ status: r.status, body: r.status === 204 ? null : await r.json() });

export interface MockShopify extends ShopifyClient {
  discounts: any[];
  failNext: boolean;
}

export function mockShopify(): MockShopify {
  const m: MockShopify = {
    discounts: [],
    failNext: false,
    async getCustomer() {
      return { id: "gid://shopify/Customer/42", email: "ana@example.com", firstName: "Ana", lastName: "Pérez", phone: null };
    },
    async createDiscount(req) {
      if (m.failNext) {
        m.failNext = false;
        throw new Error("shopify caído");
      }
      m.discounts.push(req);
      return { id: `gid://shopify/DiscountCodeNode/${m.discounts.length}` };
    },
    async deleteDiscount() {},
  };
  setShopify(m);
  return m;
}
