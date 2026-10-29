import { audit } from "./audit";
import type { Db } from "./db";
import { conflict, notFound } from "./errors";

/**
 * Libera un tag que una clienta ya reclamó: lo deja «sin reclamar» para que se pueda activar de nuevo
 * (por ella o por otra clienta) y borra el tratamiento que lo reclamó, con sus dosis y cambios de horario.
 *
 * Lo que se conserva: las lecturas (`scans`, quedan sin dosis asociada), el libro de puntos (inmutable, la
 * clienta conserva lo ganado; ajustarlo, si hace falta, es un ajuste manual) y el contador del tag
 * (protección contra repeticiones). La acción queda en la bitácora con un resumen de lo borrado.
 */
export async function releaseTag(t: Db, adminId: string, uid: string, reason: string) {
  const tag = await t.one<any>("select * from tags where uid = $1 for update", [uid.toUpperCase()]);
  if (!tag) throw notFound("tag_not_found");
  if (!tag.claimed_by) throw conflict("tag_not_claimed", "Este tag no está reclamado: no hay nada que liberar");

  const treatment = await t.one<any>(
    "select id, user_id, status, start_date, end_date, points_earned from treatments where tag_uid = $1 for update",
    [tag.uid],
  );

  let removed: Record<string, unknown> | null = null;
  if (treatment) {
    const doses = await t.many<{ status: string; n: number }>(
      "select status, count(*)::int as n from doses where treatment_id = $1 group by status",
      [treatment.id],
    );
    await t.exec("update scans set dose_id = null where dose_id in (select id from doses where treatment_id = $1)", [treatment.id]);
    await t.exec("delete from schedule_changes where treatment_id = $1", [treatment.id]);
    await t.exec("delete from doses where treatment_id = $1", [treatment.id]);
    await t.exec("delete from treatments where id = $1", [treatment.id]);
    removed = { ...treatment, doses: Object.fromEntries(doses.map((d) => [d.status, d.n])) };
  }

  const after = await t.one<any>(
    `update tags set status = 'unclaimed', claimed_by = null, claimed_at = null, shopify_order_id = null, blocked_reason = null
      where uid = $1 returning *`,
    [tag.uid],
  );
  await audit(t, adminId, "tag.release", "tag", tag.uid, { tag, treatment: removed }, { ...after, reason });
  return { uid: after.uid, status: after.status, released_from: tag.claimed_by, treatment_removed: !!treatment };
}
