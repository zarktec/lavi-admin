import { z } from "zod";
import { MAX_FAILED_ATTEMPTS, LOCK_MINUTES, checkPassword, createSession, dummyCompare, otpauthUri, sessionCookie } from "@/lib/auth-admin";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { ApiError, unauthorized } from "@/lib/errors";
import { handle, parseBody } from "@/lib/http";

const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

/** Paso 1: contraseña. Deja una sesión pendiente de verificación en dos pasos. */
export const POST = handle(async (req) => {
  const { email, password } = await parseBody(req, schema);
  const a = await db.one<any>("select * from admin_users where lower(email) = lower($1)", [email]);
  if (!a || a.status === "disabled") {
    await dummyCompare(password);
    throw unauthorized("invalid_credentials", "Correo o contraseña incorrectos");
  }
  if (a.locked_until && new Date(a.locked_until) > new Date()) {
    throw new ApiError(423, "account_locked", "Cuenta bloqueada temporalmente por intentos fallidos. Intenta más tarde.");
  }
  if (!(await checkPassword(password, a.password_hash))) {
    const lock = a.failed_attempts + 1 >= MAX_FAILED_ATTEMPTS;
    await db.exec(
      "update admin_users set failed_attempts = $2, locked_until = case when $3 then now() + ($4 || ' minutes')::interval end where id = $1",
      [a.id, lock ? 0 : a.failed_attempts + 1, lock, String(LOCK_MINUTES)],
    );
    throw unauthorized("invalid_credentials", "Correo o contraseña incorrectos");
  }
  await db.exec("update admin_users set failed_attempts = 0, locked_until = null where id = $1", [a.id]);
  const token = await createSession(a.id);
  const setup = a.status === "pending" && a.totp_secret_ref;
  return Response.json(
    {
      mfa: setup ? "setup" : "required",
      ...(setup ? { otpauth_uri: otpauthUri(decryptSecret(a.totp_secret_ref), a.email), secret: decryptSecret(a.totp_secret_ref) } : {}),
    },
    { headers: { "Set-Cookie": sessionCookie(token) } },
  );
});
