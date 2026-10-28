import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ok, parseBody } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { simulateMaxCost } from "@/lib/simulator";

const schema = z.object({
  doses_per_day: z.number().int().min(1),
  duration_days: z.number().int().min(1),
  points_per_dose: z.number().int().min(0),
  welcome_points: z.number().int().min(0).default(0),
  max_points_per_treatment: z.number().int().min(0).nullable().default(null),
  streak_rules: z.array(z.object({ streak_length: z.number().int().min(1), bonus_points: z.number().int().min(0), repeatable: z.boolean().default(false) })).default([]),
});

/** Simulador del costo máximo por tratamiento (adherencia perfecta), en puntos y pesos. */
export const POST = adminHandle("catalog.view", async (req) => {
  const b = await parseBody(req, schema);
  const s = await getSettings(db);
  return ok({ ...simulateMaxCost(b, s.point_value_cop), point_value_cop: s.point_value_cop });
});
