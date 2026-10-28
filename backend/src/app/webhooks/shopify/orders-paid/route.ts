import { handle } from "@/lib/http";
import { receiveWebhook, onOrderPaid } from "@/lib/webhooks";

export const POST = handle((req) => receiveWebhook(req, "orders/paid", onOrderPaid));
