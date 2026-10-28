import { z } from "zod";
import { requireUser } from "@/lib/auth-user";
import { db } from "@/lib/db";
import { handle, ok, parseBody } from "@/lib/http";
import { isValidZone } from "@/lib/tz";
import { deleteAccount } from "@/lib/users";
import { getBalance } from "@/lib/points";

const profile = async (id: string) => {
  const u = await db.one("select id, email, name, phone, timezone, data_consent_at, created_at from users where id = $1", [id]);
  return { ...u, balance: await getBalance(db, id) };
};

export const GET = handle(async (req) => ok(await profile((await requireUser(req)).id)));

const patch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().refine(isValidZone, "Zona horaria inválida").optional(),
  accept_data_policy: z.literal(true).optional(),
});

export const PATCH = handle(async (req) => {
  const user = await requireUser(req);
  const b = await parseBody(req, patch);
  await db.exec(
    `update users set name = coalesce($2, name), timezone = coalesce($3, timezone),
            data_consent_at = case when $4 then coalesce(data_consent_at, now()) else data_consent_at end where id = $1`,
    [user.id, b.name ?? null, b.timezone ?? null, !!b.accept_data_policy],
  );
  return ok(await profile(user.id));
});

export const DELETE = handle(async (req) => {
  const user = await requireUser(req);
  await deleteAccount(user.id);
  return new Response(null, { status: 204 });
});
