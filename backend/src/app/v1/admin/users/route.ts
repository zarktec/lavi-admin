import { adminHandle } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ok } from "@/lib/http";

export const GET = adminHandle("superadmin", async () => {
  const users = await db.many(
    `select a.id, a.email, a.name, a.status, a.last_login_at, a.created_at, a.locked_until, r.id as role_id, r.name as role_name, r.is_superadmin,
            (a.totp_secret_ref is not null) as has_mfa
       from admin_users a join roles r on r.id = a.role_id order by a.created_at`,
  );
  return ok({ users });
});
