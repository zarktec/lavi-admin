import { requireUser } from "@/lib/auth-user";
import { handle, ok } from "@/lib/http";
import { getTreatmentDetail } from "@/lib/treatments";

export const GET = handle<{ id: string }>(async (req, { id }) => {
  const user = await requireUser(req);
  return ok(await getTreatmentDetail(user.id, id));
});
