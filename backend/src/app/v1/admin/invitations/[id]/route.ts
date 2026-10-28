import { adminHandle } from "@/lib/auth-admin";
import { audit } from "@/lib/audit";
import { tx } from "@/lib/db";
import { notFound } from "@/lib/errors";

export const DELETE = adminHandle<{ id: string }>("superadmin", async (_req, { id }, a) => {
  await tx(async (t) => {
    const n = await t.exec("update invitations set expires_at = now() where id = $1 and accepted_at is null", [id]);
    if (!n) throw notFound("invitation_not_found");
    await audit(t, a.admin.id, "invitation.revoke", "invitation", id, null, null);
  });
  return new Response(null, { status: 204 });
});
