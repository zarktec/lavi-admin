import { cronRoute } from "@/lib/cron";
import { closeDoses } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const { GET, POST } = cronRoute(() => closeDoses());
