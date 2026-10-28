import { requireUser } from "@/lib/auth-user";
import { handle, ok } from "@/lib/http";
import { listOptions } from "@/lib/redemptions";

export const GET = handle(async (req) => ok(await listOptions((await requireUser(req)).id)));
