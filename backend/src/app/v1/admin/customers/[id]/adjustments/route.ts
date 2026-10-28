import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { applyAdjustment } from "@/lib/adjustments";
import { audit } from "@/lib/audit";
import { tx } from "@/lib/db";
import { ApiError, notFound } from "@/lib/errors";
import { ok, parseBody } from "@/lib/http";
import { getSettings } from "@/lib/settings";

const schema = z.object({ amount: z.number().int().refine((n) => n !== 0, "El monto no puede ser 0"), reason: z.string().trim().min(5).max(300) });

/**
 * Ajuste manual con motivo obligatorio. Por encima del umbral global queda pendiente
 * de aprobación de un superadministrador (que lo aplica de inmediato si es quien lo registra).
 */
export const POST = adminHandle<{ id: string }>("points.adjust", async (req, { id }, a) => {
  const b = await parseBody(req, schema);
  const out = await tx(async (t) => {
    if (!(await t.one("select 1 from users where id = $1", [id]))) throw notFound("user_not_found", "Clienta no encontrada");
    const settings = await getSettings(t);
    const abs = Math.abs(b.amount);
    if (a.admin.max_adjustment != null && abs > a.admin.max_adjustment) {
      throw new ApiError(403, "above_role_limit", `Tu rol puede ajustar hasta ${a.admin.max_adjustment} puntos por movimiento`);
    }
    const needsApproval = abs > settings.manual_adjustment_approval_threshold && !a.admin.is_superadmin;
    const adj = await t.one<any>(
      `insert into points_adjustments (user_id, amount, reason, status, requested_by, decided_by, decided_at)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [id, b.amount, b.reason, needsApproval ? "pending_approval" : "applied", a.admin.id, needsApproval ? null : a.admin.id, needsApproval ? null : new Date()],
    );
    if (!needsApproval) await applyAdjustment(t, adj, a.admin.id);
    await audit(t, a.admin.id, needsApproval ? "points.adjust_requested" : "points.adjust", "points_adjustment", adj.id, null, adj);
    return adj;
  });
  return ok(out, 201);
});
