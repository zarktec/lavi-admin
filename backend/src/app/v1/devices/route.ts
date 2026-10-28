import { z } from "zod";
import { requireUser } from "@/lib/auth-user";
import { db } from "@/lib/db";
import { handle, ok, parseBody } from "@/lib/http";

const schema = z.object({ push_token: z.string().min(10), platform: z.enum(["ios", "android"]) });

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const b = await parseBody(req, schema);
  const d = await db.one(
    `insert into devices (user_id, push_token, platform) values ($1, $2, $3)
     on conflict (push_token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen = now()
     returning id`,
    [user.id, b.push_token, b.platform],
  );
  return ok({ id: d!.id }, 201);
});
