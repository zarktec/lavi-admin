import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { ok, parseBody } from "@/lib/http";
import { reverseRedemption } from "@/lib/redemptions";
import { db } from "@/lib/db";

export const POST = adminHandle<{ id: string }>("redemptions.manage", async (req, { id }, a) => {
  const { note } = await parseBody(req, z.object({ note: z.string().trim().min(5).max(300) }));
  const before = await reverseRedemption(id, a.admin.id, note);
  await audit(db, a.admin.id, "redemption.reverse", "redemption", id, before, { note });
  return ok({ ok: true });
});
