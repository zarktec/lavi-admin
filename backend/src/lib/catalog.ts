import { z } from "zod";
import { isValidTime } from "./tz";
import { validateTimes } from "./doses";

export const configSchema = z
  .object({
    doses_per_day: z.number().int().min(1).max(12),
    default_reminder_times: z.array(z.string().refine(isValidTime, "Formato HH:mm")),
    window_minutes_before: z.number().int().min(0).max(720),
    window_minutes_after: z.number().int().min(0).max(720),
    duration_days: z.number().int().min(1).max(730),
    points_per_dose: z.number().int().min(0),
    missed_dose_penalty: z.number().int().min(0).default(0),
    late_dose_avoids_penalty: z.boolean().default(false),
    max_points_per_treatment: z.number().int().min(0).nullable().default(null),
    welcome_points: z.number().int().min(0).default(0),
    reminder_nudges: z.array(z.number().int().min(0)).default([]),
    backup_push_enabled: z.boolean().default(true),
    schedule_change_min_notice_hours: z.number().int().min(0).default(0),
    schedule_change_max_count: z.number().int().min(0).default(0),
    schedule_change_period_days: z.number().int().min(1).default(30),
    repurchase_reminder_days: z.number().int().min(0).default(0),
    effective_from: z.string().datetime({ offset: true }).optional(),
    streak_rules: z
      .array(z.object({ streak_length: z.number().int().min(1), bonus_points: z.number().int().min(0), repeatable: z.boolean().default(false) }))
      .default([]),
  })
  .superRefine((c, ctx) => {
    try {
      validateTimes(c.default_reminder_times, c.doses_per_day, c.window_minutes_before, c.window_minutes_after);
    } catch (e) {
      ctx.addIssue({ code: "custom", path: ["default_reminder_times"], message: (e as Error).message });
    }
  });

export type ConfigInput = z.infer<typeof configSchema>;

export const optionSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    points_cost: z.number().int().positive(),
    reward_type: z.enum(["fixed_amount", "percentage", "free_product", "free_shipping"]),
    reward_value: z.number().positive().nullish(),
    shopify_product_id: z.string().trim().max(120).nullish(),
    combines_with: z.object({ productDiscounts: z.boolean(), orderDiscounts: z.boolean(), shippingDiscounts: z.boolean() }).default({ productDiscounts: false, orderDiscounts: false, shippingDiscounts: false }),
    active: z.boolean().default(true),
  })
  .superRefine((o, ctx) => {
    if (o.reward_type === "fixed_amount" && !o.reward_value) ctx.addIssue({ code: "custom", path: ["reward_value"], message: "Indica el monto en pesos" });
    if (o.reward_type === "percentage" && (!o.reward_value || o.reward_value > 100)) ctx.addIssue({ code: "custom", path: ["reward_value"], message: "Indica un porcentaje entre 1 y 100" });
    if (o.reward_type === "free_product" && !o.shopify_product_id) ctx.addIssue({ code: "custom", path: ["shopify_product_id"], message: "Indica el producto de Shopify" });
  });


export const variantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().max(80).nullish(),
  shopify_variant_id: z.string().trim().max(120).nullish(),
  volume_ml: z.number().int().positive().nullish(),
});

