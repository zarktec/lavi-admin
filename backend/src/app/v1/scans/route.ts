import { z } from "zod";
import { requireUser } from "@/lib/auth-user";
import { handle, ok, parseBody } from "@/lib/http";
import { processScan } from "@/lib/scans";

const schema = z.object({
  tag_url: z.string().min(10).max(2000),
  device_time: z.string().datetime({ offset: true }).optional(),
  offline: z.boolean().optional(),
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  return ok(await processScan(user, await parseBody(req, schema)));
});
