import { handle } from "@/lib/http";
import { receiveWebhook, onRefundCreated } from "@/lib/webhooks";

export const POST = handle((req) => receiveWebhook(req, "refunds/create", onRefundCreated));
