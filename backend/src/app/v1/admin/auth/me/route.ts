import { loadAdmin } from "@/lib/auth-admin";
import { handle, ok } from "@/lib/http";

export const GET = handle(async (req) => {
  const a = await loadAdmin(req);
  return ok({ admin: a.admin, permissions: [...a.permissions].sort() });
});
