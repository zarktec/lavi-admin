import { z } from "zod";
import { randomToken, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { resetMail, sendMail } from "@/lib/email";
import { envOpt } from "@/lib/env";
import { handle, ok, parseBody } from "@/lib/http";

/** Siempre responde igual, exista o no el correo. */
export const POST = handle(async (req) => {
  const { email } = await parseBody(req, z.object({ email: z.string().email() }));
  const a = await db.one<{ id: string; email: string }>("select id, email from admin_users where lower(email) = lower($1) and status <> 'disabled'", [email]);
  if (a) {
    const token = randomToken(32);
    await db.exec("insert into password_resets (admin_user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 hour')", [a.id, sha256(token)]);
    await sendMail(resetMail(a.email, `${envOpt("ADMIN_BASE_URL")}/admin/reset?token=${token}`));
  }
  return ok({ ok: true });
});
