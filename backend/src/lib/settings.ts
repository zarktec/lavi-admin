import { z } from "zod";
import type { Db } from "./db";
import { ApiError } from "./errors";

/** Ajustes globales (tabla SETTINGS). Ningún valor vive en el código: se cargan desde el panel o `npm run seed`. */
export const notificationTextsSchema = z.object({
  reminder_title: z.string().min(1),
  reminder_body: z.string().min(1),
  nudge_body: z.string().min(1),
  backup_title: z.string().min(1),
  backup_body: z.string().min(1),
  repurchase_title: z.string().min(1),
  repurchase_body: z.string().min(1),
});

export const settingsSchema = z.object({
  point_value_cop: z.number().nonnegative(),
  points_expiration_days: z.number().int().nonnegative(), // 0 = no vencen
  min_points_to_redeem: z.number().int().nonnegative(),
  allow_negative_balance: z.boolean(),
  allow_parallel_treatments: z.boolean(),
  offline_scan_max_hours: z.number().nonnegative(),
  offline_device_time_tolerance_minutes: z.number().int().nonnegative(),
  redemption_code_valid_days: z.number().int().positive(),
  refund_points_on_expired_code: z.boolean(),
  manual_adjustment_approval_threshold: z.number().int().nonnegative(),
  min_app_version: z.string().regex(/^\d+(\.\d+){0,2}$/),
  activation_token_minutes: z.number().int().positive(),
  notification_texts: notificationTextsSchema,
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.many<{ key: string; value: unknown }>("select key, value from settings");
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new ApiError(500, "settings_missing", `Ajustes globales sin configurar: ${missing}`);
  }
  return parsed.data;
}

export async function saveSettings(
  db: Db,
  patch: Partial<Settings>,
  adminId: string | null,
): Promise<{ before: Record<string, unknown>; after: Record<string, unknown> }> {
  const keys = Object.keys(patch) as SettingKey[];
  const rows = await db.many<{ key: string; value: unknown }>("select key, value from settings where key = any($1)", [keys]);
  const before = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  for (const k of keys) {
    await db.exec(
      `insert into settings (key, value, updated_by, updated_at) values ($1, $2::jsonb, $3, now())
       on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
      [k, JSON.stringify(patch[k]), adminId],
    );
  }
  return { before, after: patch as Record<string, unknown> };
}

/** Compara versiones tipo 1.2.3 (true si a < b). */
export function versionLt(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}
