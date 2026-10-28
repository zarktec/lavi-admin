import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { db, tx } from "@/lib/db";
import { conflict } from "@/lib/errors";
import { roleSchema, validatePermissions } from "@/lib/team";
import { ok, parseBody } from "@/lib/http";

export const GET = adminHandle("superadmin", async () => {
  const roles = await db.many(
    "select r.id, r.name, r.description, r.is_superadmin, r.is_system, r.max_adjustment, (select count(*)::int from admin_users a where a.role_id = r.id) as users from roles r order by r.is_superadmin desc, r.name",
  );
  const rp = await db.many("select role_id, permission_code from role_permissions");
  return ok({ roles: roles.map((r) => ({ ...r, permissions: rp.filter((x) => x.role_id === r.id).map((x) => x.permission_code) })) });
});

export const POST = adminHandle("superadmin", async (req, _p, a) => {
  const b = await parseBody(req, roleSchema);
  const row = await tx(async (t) => {
    await validatePermissions(t, b.permissions);
    if (await t.one("select 1 from roles where lower(name) = lower($1)", [b.name])) throw conflict("role_exists", "Ya existe un rol con ese nombre");
    const r = await t.one<any>("insert into roles (name, description, max_adjustment) values ($1, $2, $3) returning *", [b.name, b.description ?? null, b.max_adjustment ?? null]);
    for (const p of new Set(b.permissions)) await t.exec("insert into role_permissions (role_id, permission_code) values ($1, $2)", [r.id, p]);
    await audit(t, a.admin.id, "role.create", "role", r.id, null, { ...r, permissions: b.permissions });
    return { ...r, permissions: b.permissions };
  });
  return ok(row, 201);
});
