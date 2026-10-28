import { z } from "zod";
import { requireUser } from "@/lib/auth-user";
import { handle, ok, parseBody } from "@/lib/http";
import { createTreatment, listTreatments } from "@/lib/treatments";

const schema = z.object({
  activation_token: z.string().min(10),
  reminder_times: z.array(z.string()).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  return ok(await createTreatment(user, await parseBody(req, schema)), 201);
});

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  return ok({ treatments: await listTreatments(user.id) });
});
