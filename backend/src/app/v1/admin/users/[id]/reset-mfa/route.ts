import { adminHandle, encryptTotp, newTotpSecret } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { tx } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { ok } from "@/lib/http";

/** El superadministrador reinicia la verificación en dos pasos de otra persona: en su próximo ingreso verá un QR nuevo. */
export const POST = adminHandle<{ id: string }>("superadmin", async (_req, { id }, a) => {
  await tx(async (t) => {
    const u = await t.one("select id from admin_users where id = $1 for update", [id]);
    if (!u) throw notFound("admin_not_found");
    await t.exec("update admin_users set totp_secret_ref = $2, status = case when status = 'disabled' then status else 'pending' end where id = $1", [id, encryptTotp(newTotpSecret())]);
    await t.exec("update admin_sessions set revoked_at = now() where admin_user_id = $1 and revoked_at is null", [id]);
    await audit(t, a.admin.id, "admin_user.reset_mfa", "admin_user", id, null, null);
  });
  return ok({ ok: true });
});
