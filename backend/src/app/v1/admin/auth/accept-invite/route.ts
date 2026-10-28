import { z } from "zod";
import { assertStrongPassword, encryptTotp, hashPassword, newTotpSecret, otpauthUri } from "@/lib/auth-admin";
import { sha256 } from "@/lib/crypto";
import { tx } from "@/lib/db";
import { ApiError, conflict } from "@/lib/errors";
import { handle, ok, parseBody } from "@/lib/http";
import { audit } from "@/lib/audit";

const schema = z.object({ token: z.string().min(20), password: z.string(), name: z.string().trim().min(1).max(120).optional() });

/** La persona invitada define su contraseña y recibe el secreto para configurar la verificación en dos pasos. */
export const POST = handle(async (req) => {
  const b = await parseBody(req, schema);
  assertStrongPassword(b.password);
  const out = await tx(async (t) => {
    const inv = await t.one<any>(
      "select * from invitations where token_hash = $1 and accepted_at is null and expires_at > now() for update",
      [sha256(b.token)],
    );
    if (!inv) throw new ApiError(400, "invitation_invalid", "La invitación venció o ya fue usada");
    const exists = await t.one("select 1 from admin_users where lower(email) = lower($1)", [inv.email]);
    if (exists) throw conflict("email_taken", "Ya existe un usuario con ese correo");
    const secret = newTotpSecret();
    const admin = await t.one<{ id: string }>(
      `insert into admin_users (email, name, password_hash, totp_secret_ref, role_id, status)
       values ($1, $2, $3, $4, $5, 'pending') returning id`,
      [inv.email, b.name ?? inv.name ?? inv.email, await hashPassword(b.password), encryptTotp(secret), inv.role_id],
    );
    await t.exec("update invitations set accepted_at = now() where id = $1", [inv.id]);
    await audit(t, admin!.id, "invitation.accept", "admin_user", admin!.id, null, { email: inv.email, role_id: inv.role_id });
    return { secret, otpauth_uri: otpauthUri(secret, inv.email) };
  });
  return ok(out, 201);
});
