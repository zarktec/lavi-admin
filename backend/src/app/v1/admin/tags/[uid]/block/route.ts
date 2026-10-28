import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { tx } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { ok, parseBody } from "@/lib/http";

export const POST = adminHandle<{ uid: string }>("tags.manage", async (req, { uid }, a) => {
  const b = await parseBody(req, z.object({ blocked: z.boolean(), reason: z.string().trim().min(3).max(300) }));
  const row = await tx(async (t) => {
    const before = await t.one<any>("select * from tags where uid = $1 for update", [uid.toUpperCase()]);
    if (!before) throw notFound("tag_not_found");
    const status = b.blocked ? "blocked" : before.claimed_by ? "claimed" : "unclaimed";
    const after = await t.one("update tags set status = $2, blocked_reason = $3 where uid = $1 returning *", [before.uid, status, b.blocked ? b.reason : null]);
    if (b.blocked) await t.exec("update treatments set status = 'cancelled', finished_at = now() where tag_uid = $1 and status = 'active'", [before.uid]);
    await audit(t, a.admin.id, b.blocked ? "tag.block" : "tag.unblock", "tag", before.uid, before, { ...after, reason: b.reason });
    return after;
  });
  return ok(row);
});
