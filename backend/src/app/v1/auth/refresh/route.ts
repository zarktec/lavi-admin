import { z } from "zod";
import { refreshSession } from "@/lib/auth-user";
import { handle, ok, parseBody } from "@/lib/http";

export const POST = handle(async (req) => {
  const { refresh_token } = await parseBody(req, z.object({ refresh_token: z.string().min(10) }));
  return ok(await refreshSession(refresh_token));
});
