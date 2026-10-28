import { openapi } from "@/lib/openapi";

export const dynamic = "force-static";

/** Contrato OpenAPI de la API de la app móvil (pública, sin datos sensibles). */
export const GET = () =>
  Response.json(openapi, { headers: { "Cache-Control": "public, max-age=300" } });
