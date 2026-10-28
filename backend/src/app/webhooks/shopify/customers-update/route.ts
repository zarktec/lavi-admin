import { handle } from "@/lib/http";
import { receiveWebhook, onCustomerUpdate } from "@/lib/webhooks";

export const POST = handle((req) => receiveWebhook(req, "customers/update", onCustomerUpdate));
