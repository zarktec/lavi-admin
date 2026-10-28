import { clearCookie, loadAdmin } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { handle } from "@/lib/http";

export const POST = handle(async (req) => {
  const a = await loadAdmin(req, { allowPendingMfa: true });
  await db.exec("update admin_sessions set revoked_at = now() where id = $1", [a.sessionId]);
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearCookie() } });
});
