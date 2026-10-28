import { cronRoute } from "@/lib/cron";
import { backupPush } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const { GET, POST } = cronRoute(() => backupPush());
