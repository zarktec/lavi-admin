import { z } from "zod";
import { requireUser } from "@/lib/auth-user";
import { ApiError } from "@/lib/errors";
import { handle, ok, parseBody } from "@/lib/http";
import { listRedemptions, redeem } from "@/lib/redemptions";

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const key = req.headers.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 128) throw new ApiError(400, "missing_idempotency_key", "Falta el encabezado Idempotency-Key");
  const { option_id } = await parseBody(req, z.object({ option_id: z.string().uuid() }));
  const out = await redeem(user, option_id, key);
  return ok(out.body, out.status);
});

export const GET = handle(async (req) => ok({ redemptions: await listRedemptions((await requireUser(req)).id) }));
