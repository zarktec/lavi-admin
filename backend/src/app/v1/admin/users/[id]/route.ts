import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { tx } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { ok, parseBody } from "@/lib/http";
import { assertNotLastSuperadmin } from "@/lib/team";

const schema = z.object({ role_id: z.string().uuid().optional(), status: z.enum(["active", "disabled"]).optional(), name: z.string().trim().min(1).max(120).optional() });

/** Los usuarios del panel se desactivan, nunca se borran, para conservar la bitácora. */
export const PATCH = adminHandle<{ id: string }>("superadmin", async (req, { id }, a) => {
  const b = await parseBody(req, schema);
  const row = await tx(async (t) => {
    const before = await t.one<any>("select id, email, name, role_id, status from admin_users where id = $1 for update", [id]);
    if (!before) throw notFound("admin_not_found");
    const losesSuper = b.status === "disabled" || (b.role_id && b.role_id !== before.role_id);
    if (losesSuper) await assertNotLastSuperadmin(t, id);
    if (b.role_id && !(await t.one("select 1 from roles where id = $1", [b.role_id]))) throw notFound("role_not_found");
    // Reactivar una cuenta que nunca terminó su alta la deja pendiente
    const after = await t.one<any>(
      `update admin_users set role_id = coalesce($2, role_id), name = coalesce($3, name),
              status = case when $4::text is null then status when $4 = 'active' and last_login_at is null then 'pending' else $4 end
        where id = $1 returning id, email, name, role_id, status`,
      [id, b.role_id ?? null, b.name ?? null, b.status ?? null],
    );
    if (b.status === "disabled" || b.role_id) await t.exec("update admin_sessions set revoked_at = now() where admin_user_id = $1 and revoked_at is null", [id]);
    await audit(t, a.admin.id, "admin_user.update", "admin_user", id, before, after);
    return after;
  });
  return ok(row);
});
