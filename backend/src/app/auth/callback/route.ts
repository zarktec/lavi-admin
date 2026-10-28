import { envOpt } from "@/lib/env";
import { appCallbackUrl, authCallbackHtml } from "@/lib/auth-callback";

export const dynamic = "force-dynamic";

/** URI de devolución https registrada en Shopify (Customer Account API); reenvía a la app móvil. */
export function GET(req: Request) {
  const scheme = envOpt("APP_SCHEME", "lavi");
  const target = appCallbackUrl(scheme, new URL(req.url).search);
  return new Response(authCallbackHtml(target), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
