import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { db, tx } from "@/lib/db";
import { ApiError, conflict, notFound } from "@/lib/errors";
import { ok, parseBody } from "@/lib/http";
import { loadMasterKeys } from "@/lib/ntag";

export const GET = adminHandle("tags.view", async () => {
  const rows = await db.many(
    `select b.id, b.batch_code, b.status, b.imported_at, b.variant_id, v.name as variant_name, p.name as product_name,
            count(t.uid)::int as tags_total,
            count(t.uid) filter (where t.status = 'claimed')::int as tags_claimed,
            count(t.uid) filter (where t.status = 'blocked')::int as tags_blocked
       from tag_batches b join product_variants v on v.id = b.variant_id join products p on p.id = v.product_id
       left join tags t on t.batch_id = b.id group by b.id, v.name, p.name order by b.imported_at desc limit 200`,
  );
  return ok({ batches: rows });
});

const UID = /^[0-9A-Fa-f]{14}$/;
const schema = z.object({
  variant_id: z.string().uuid(),
  batch_code: z.string().trim().min(1).max(80),
  key_ref: z.string().trim().min(1).max(40).optional(),
  /** CSV del fabricante: una fila por tag, "uid[,key_ref]". Acepta encabezado. */
  csv: z.string().max(2_000_000).optional(),
  tags: z.array(z.object({ uid: z.string(), key_ref: z.string().optional() })).max(50_000).optional(),
});

/** Importa un lote del fabricante: los UID quedan "sin reclamar" y atados a una presentación. */
export const POST = adminHandle("tags.manage", async (req, _p, a) => {
  const b = await parseBody(req, schema);
  const refs = new Set(loadMasterKeys().map((k) => k.ref));
  const defaultRef = b.key_ref ?? (refs.size === 1 ? [...refs][0] : undefined);

  let entries = b.tags ?? [];
  if (b.csv) {
    entries = b.csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^uid\b/i.test(l))
      .map((l) => {
        const [uid, ref] = l.split(/[,;\t]/).map((s) => s.trim());
        return { uid, key_ref: ref || undefined };
      });
  }
  if (!entries.length) throw new ApiError(400, "empty_batch", "El lote no trae tags");
  const invalid = entries.filter((e) => !UID.test(e.uid)).map((e) => e.uid);
  if (invalid.length) throw new ApiError(400, "invalid_uid", `UID inválidos (14 caracteres hex): ${invalid.slice(0, 5).join(", ")}`);
  const prepared = entries.map((e) => ({ uid: e.uid.toUpperCase(), key_ref: e.key_ref ?? defaultRef }));
  const badRef = prepared.find((e) => !e.key_ref || !refs.has(e.key_ref));
  if (badRef) throw new ApiError(400, "unknown_key_ref", `Llave maestra desconocida para ${badRef.uid}; indica key_ref (${[...refs].join(", ")})`);

  const out = await tx(async (t) => {
    if (!(await t.one("select 1 from product_variants where id = $1", [b.variant_id]))) throw notFound("variant_not_found");
    if (await t.one("select 1 from tag_batches where batch_code = $1", [b.batch_code])) throw conflict("batch_exists", "Ya existe un lote con ese código");
    const batch = await t.one<{ id: string }>(
      "insert into tag_batches (variant_id, batch_code, imported_by) values ($1, $2, $3) returning id",
      [b.variant_id, b.batch_code, a.admin.id],
    );
    const uniq = [...new Map(prepared.map((e) => [e.uid, e])).values()];
    const inserted = await t.exec(
      `insert into tags (uid, batch_id, variant_id, key_ref)
       select u, $1, $2, k from unnest($3::text[], $4::text[]) as x(u, k) on conflict (uid) do nothing`,
      [batch!.id, b.variant_id, uniq.map((e) => e.uid), uniq.map((e) => e.key_ref)],
    );
    await audit(t, a.admin.id, "tag_batch.import", "tag_batch", batch!.id, null, { batch_code: b.batch_code, received: entries.length, imported: inserted });
    return { id: batch!.id, batch_code: b.batch_code, received: entries.length, imported: inserted, skipped_existing: uniq.length - inserted, duplicates_in_file: entries.length - uniq.length };
  });
  return ok(out, 201);
});
