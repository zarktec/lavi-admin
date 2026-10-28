import { env } from "@/lib/env";

// Verificación de App Links (Android): se sirve en /.well-known/assetlinks.json
export function GET() {
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: env("ANDROID_PACKAGE"),
          sha256_cert_fingerprints: env("ANDROID_SHA256_FINGERPRINTS").split(",").map((s) => s.trim()),
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
