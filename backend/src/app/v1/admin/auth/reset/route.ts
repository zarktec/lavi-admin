import { z } from "zod";
import { assertStrongPassword, hashPassword } from "@/lib/auth-admin";
import { sha256 } from "@/lib/crypto";
import { tx } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { handle, ok, parseBody } from "@/lib/http";
import { audit } from "@/lib/audit";

export const POST = handle(async (req) => {
  const { token, password } = await parseBody(req, z.object({ token: z.string().min(20), password: z.string() }));
  assertStrongPassword(password);
  await tx(async (t) => {
    const r = await t.one<{ id: string; admin_user_id: string }>(
      "update password_resets set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning id, admin_user_id",
      [sha256(token)],
    );
    if (!r) throw new ApiError(400, "reset_invalid", "El enlace venció o ya fue usado");
    await t.exec("update admin_users set password_hash = $2, failed_attempts = 0, locked_until = null where id = $1", [r.admin_user_id, await hashPassword(password)]);
    await t.exec("update admin_sessions set revoked_at = now() where admin_user_id = $1 and revoked_at is null", [r.admin_user_id]);
    await audit(t, r.admin_user_id, "password.reset", "admin_user", r.admin_user_id, null, null);
  });
  return ok({ ok: true });
});
