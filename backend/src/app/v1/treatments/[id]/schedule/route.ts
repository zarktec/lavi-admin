import { z } from "zod";
import { requireUser } from "@/lib/auth-user";
import { handle, ok, parseBody } from "@/lib/http";
import { updateSchedule } from "@/lib/treatments";

export const PATCH = handle<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  const { reminder_times } = await parseBody(req, z.object({ reminder_times: z.array(z.string()).min(1) }));
  return ok(await updateSchedule(user, id, { reminder_times }));
});
