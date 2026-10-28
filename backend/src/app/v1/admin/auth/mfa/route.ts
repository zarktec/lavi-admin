import { z } from "zod";
import { LOCK_MINUTES, MAX_FAILED_ATTEMPTS, loadAdmin, verifyTotp } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { ApiError, unauthorized } from "@/lib/errors";
import { handle, ok, parseBody } from "@/lib/http";

/** Paso 2: código TOTP de la app autenticadora. En el primer ingreso activa la cuenta. */
export const POST = handle(async (req) => {
  const a = await loadAdmin(req, { allowPendingMfa: true });
  const { code } = await parseBody(req, z.object({ code: z.string().regex(/^\s*\d{3}\s?\d{3}\s*$/) }));
  const row = await db.one<any>("select totp_secret_ref, failed_attempts, locked_until from admin_users where id = $1", [a.admin.id]);
  if (row.locked_until && new Date(row.locked_until) > new Date()) throw new ApiError(423, "account_locked", "Cuenta bloqueada temporalmente");
  if (!row.totp_secret_ref || !verifyTotp(row.totp_secret_ref, code)) {
    const lock = row.failed_attempts + 1 >= MAX_FAILED_ATTEMPTS;
    await db.exec(
      "update admin_users set failed_attempts = $2, locked_until = case when $3 then now() + ($4 || ' minutes')::interval end where id = $1",
      [a.admin.id, lock ? 0 : row.failed_attempts + 1, lock, String(LOCK_MINUTES)],
    );
    if (lock) await db.exec("update admin_sessions set revoked_at = now() where id = $1", [a.sessionId]);
    throw unauthorized("invalid_code", "Código incorrecto");
  }
  await db.exec("update admin_sessions set mfa_verified = true where id = $1", [a.sessionId]);
  await db.exec("update admin_users set status = 'active', failed_attempts = 0, last_login_at = now() where id = $1", [a.admin.id]);
  return ok({ ok: true });
});
