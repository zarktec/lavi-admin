import { cronRoute } from "@/lib/cron";
import { expireRedemptions } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const { GET, POST } = cronRoute(() => expireRedemptions());
