import { cronRoute } from "@/lib/cron";
import { expirePoints } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const { GET, POST } = cronRoute(() => expirePoints());
