import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/crypto";
import { db, tx } from "@/lib/db";
import { inviteMail, sendMail } from "@/lib/email";
import { envInt, envOpt } from "@/lib/env";
import { conflict, notFound } from "@/lib/errors";
import { ok, parseBody } from "@/lib/http";

export const GET = adminHandle("superadmin", async () => {
  const rows = await db.many(
    `select i.id, i.email, i.name, i.expires_at, i.accepted_at, i.created_at, r.name as role_name
       from invitations i join roles r on r.id = i.role_id order by i.created_at desc limit 200`,
  );
  return ok({ invitations: rows });
});

const schema = z.object({ email: z.string().email(), name: z.string().trim().max(120).optional(), role_id: z.string().uuid() });

/** Alta por invitación: enlace por correo que vence en horas. */
export const POST = adminHandle("superadmin", async (req, _p, a) => {
  const b = await parseBody(req, schema);
  const hours = envInt("ADMIN_INVITE_HOURS", 24);
  const token = randomToken(32);
  const inv = await tx(async (t) => {
    if (!(await t.one("select 1 from roles where id = $1", [b.role_id]))) throw notFound("role_not_found");
    if (await t.one("select 1 from admin_users where lower(email) = lower($1)", [b.email])) throw conflict("email_taken", "Ya existe un usuario con ese correo");
    await t.exec("update invitations set expires_at = now() where lower(email) = lower($1) and accepted_at is null and expires_at > now()", [b.email]);
    const row = await t.one<any>(
      `insert into invitations (email, name, role_id, token_hash, expires_at, invited_by)
       values ($1, $2, $3, $4, now() + ($5 || ' hours')::interval, $6) returning id, email, expires_at`,
      [b.email, b.name ?? null, b.role_id, sha256(token), String(hours), a.admin.id],
    );
    await audit(t, a.admin.id, "invitation.create", "invitation", row.id, null, { email: b.email, role_id: b.role_id });
    return row;
  });
  const link = `${envOpt("ADMIN_BASE_URL")}/admin/invite?token=${token}`;
  await sendMail(inviteMail(b.email, b.name ?? null, link, hours));
  return ok(inv, 201);
});
