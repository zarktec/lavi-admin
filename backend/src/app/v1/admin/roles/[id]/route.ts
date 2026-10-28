import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { tx } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { ok, parseBody } from "@/lib/http";
import { roleSchema, validatePermissions } from "@/lib/team";

export const PATCH = adminHandle<{ id: string }>("superadmin", async (req, { id }, a) => {
  const b = await parseBody(req, roleSchema);
  const row = await tx(async (t) => {
    const before = await t.one<any>("select * from roles where id = $1 for update", [id]);
    if (!before) throw notFound("role_not_found");
    if (before.is_superadmin) throw conflict("role_immutable", "El rol de superadministrador no se modifica");
    await validatePermissions(t, b.permissions);
    const dup = await t.one("select 1 from roles where lower(name) = lower($1) and id <> $2", [b.name, id]);
    if (dup) throw conflict("role_exists", "Ya existe un rol con ese nombre");
    const after = await t.one<any>("update roles set name = $2, description = $3, max_adjustment = $4 where id = $1 returning *", [id, b.name, b.description ?? null, b.max_adjustment ?? null]);
    await t.exec("delete from role_permissions where role_id = $1", [id]);
    for (const p of new Set(b.permissions)) await t.exec("insert into role_permissions (role_id, permission_code) values ($1, $2)", [id, p]);
    await audit(t, a.admin.id, "role.update", "role", id, before, { ...after, permissions: b.permissions });
    return { ...after, permissions: b.permissions };
  });
  return ok(row);
});

export const DELETE = adminHandle<{ id: string }>("superadmin", async (_req, { id }, a) => {
  await tx(async (t) => {
    const r = await t.one<any>("select * from roles where id = $1 for update", [id]);
    if (!r) throw notFound("role_not_found");
    if (r.is_system) throw conflict("role_system", "Los roles predefinidos no se eliminan");
    if (await t.one("select 1 from admin_users where role_id = $1 limit 1", [id])) throw conflict("role_in_use", "Hay usuarios con este rol; reasígnalos primero");
    await t.exec("delete from roles where id = $1", [id]);
    await audit(t, a.admin.id, "role.delete", "role", id, r, null);
  });
  return new Response(null, { status: 204 });
});
