import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { applyAdjustment } from "@/lib/adjustments";
import { audit } from "@/lib/audit";
import { tx } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { ok, parseBody } from "@/lib/http";

export const POST = adminHandle<{ id: string }>("points.approve", async (req, { id }, a) => {
  const b = await parseBody(req, z.object({ approve: z.boolean() }));
  const out = await tx(async (t) => {
    const adj = await t.one<any>("select * from points_adjustments where id = $1 for update", [id]);
    if (!adj) throw notFound("adjustment_not_found");
    if (adj.status !== "pending_approval") throw conflict("already_decided", "Este ajuste ya fue resuelto");
    if (adj.requested_by === a.admin.id && !a.admin.is_superadmin) throw conflict("self_approval", "No puedes aprobar tu propio ajuste");
    const after = await t.one<any>("update points_adjustments set status = $2, decided_by = $3, decided_at = now() where id = $1 returning *", [id, b.approve ? "applied" : "rejected", a.admin.id]);
    if (b.approve) await applyAdjustment(t, after, a.admin.id);
    await audit(t, a.admin.id, b.approve ? "points.adjust_approved" : "points.adjust_rejected", "points_adjustment", id, adj, after);
    return after;
  });
  return ok(out);
});
