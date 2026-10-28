import { env } from "@/lib/env";

// Verificación de Universal Links (iOS): se sirve en /.well-known/apple-app-site-association
export function GET() {
  return Response.json(
    {
      applinks: {
        apps: [],
        details: [{ appID: env("IOS_APP_ID"), paths: ["/t", "/t/*"] }],
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
