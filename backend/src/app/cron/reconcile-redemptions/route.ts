import { cronRoute } from "@/lib/cron";
import { reconcileRedemptions } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const { GET, POST } = cronRoute(() => reconcileRedemptions());
