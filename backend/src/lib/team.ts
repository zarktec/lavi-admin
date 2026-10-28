import { z } from "zod";
import type { Db } from "./db";
import { ApiError, conflict } from "./errors";

/** Impide dejar el panel sin ningún superadministrador activo. */
export async function assertNotLastSuperadmin(t: Db, adminId: string) {
  const target = await t.one<{ is_superadmin: boolean; status: string }>(
    "select r.is_superadmin, a.status from admin_users a join roles r on r.id = a.role_id where a.id = $1",
    [adminId],
  );
  if (!target?.is_superadmin || target.status === "disabled") return;
  const other = await t.one(
    `select 1 from admin_users a join roles r on r.id = a.role_id
      where r.is_superadmin and a.status <> 'disabled' and a.id <> $1 limit 1`,
    [adminId],
  );
  if (!other) throw new ApiError(409, "last_superadmin", "No se puede desactivar ni degradar al último superadministrador");
}

export const roleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).nullish(),
  max_adjustment: z.number().int().positive().nullish(),
  permissions: z.array(z.string()).max(50),
});

/** Roles nuevos combinando permisos. 'team.manage' es exclusivo del superadministrador y no se asigna. */
export async function validatePermissions(t: Db, codes: string[]) {
  const known = new Set((await t.many<{ code: string }>("select code from permissions")).map((p) => p.code));
  const bad = codes.filter((c) => !known.has(c) || c === "team.manage");
  if (bad.length) throw conflict("invalid_permission", `Permisos no asignables: ${bad.join(", ")}`);
}

