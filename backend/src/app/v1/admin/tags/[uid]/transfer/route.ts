import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { tx } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { ok, parseBody } from "@/lib/http";

/** Transfiere un tag reclamado (y su tratamiento con dosis pendientes) a otra clienta. Los puntos ya ganados no se mueven. */
export const POST = adminHandle<{ uid: string }>("tags.transfer", async (req, { uid }, a) => {
  const b = await parseBody(req, z.object({ to_user_id: z.string().uuid(), reason: z.string().trim().min(5).max(300) }));
  const row = await tx(async (t) => {
    const tag = await t.one<any>("select * from tags where uid = $1 for update", [uid.toUpperCase()]);
    if (!tag) throw notFound("tag_not_found");
    if (tag.status !== "claimed") throw conflict("tag_not_claimed", "Solo se transfieren tags reclamados y no bloqueados");
    const to = await t.one<any>("select id, status, timezone from users where id = $1", [b.to_user_id]);
    if (!to || to.status !== "active") throw notFound("user_not_found", "La clienta destino no existe o no está activa");
    if (to.id === tag.claimed_by) throw conflict("same_user", "El tag ya pertenece a esa clienta");
    await t.exec("update tags set claimed_by = $2 where uid = $1", [tag.uid, to.id]);
    await t.exec("update treatments set user_id = $2 where tag_uid = $1", [tag.uid, to.id]);
    await audit(t, a.admin.id, "tag.transfer", "tag", tag.uid, { claimed_by: tag.claimed_by }, { claimed_by: to.id, reason: b.reason });
    return { uid: tag.uid, claimed_by: to.id };
  });
  return ok(row);
});
