import { z } from "zod";
import { adminHandle } from "@/lib/auth-admin";
import { tx } from "@/lib/db";
import { ok, parseBody } from "@/lib/http";
import { releaseTag } from "@/lib/tag-release";

/** Libera un tag reclamado (borra su tratamiento) para poder activarlo de nuevo. Acción destructiva: permiso propio. */
export const POST = adminHandle<{ uid: string }>("tags.release", async (req, { uid }, a) => {
  const b = await parseBody(req, z.object({ reason: z.string().trim().min(5).max(300) }));
  return ok(await tx((t) => releaseTag(t, a.admin.id, uid, b.reason)));
});
