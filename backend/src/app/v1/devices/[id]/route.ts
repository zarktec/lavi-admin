import { requireUser } from "@/lib/auth-user";
import { db } from "@/lib/db";
import { handle } from "@/lib/http";

export const DELETE = handle<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  await db.exec("delete from devices where id = $1 and user_id = $2", [id, user.id]);
  return new Response(null, { status: 204 });
});
