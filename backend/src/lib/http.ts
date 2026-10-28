import { ZodError, type ZodType } from "zod";
import { ApiError } from "./errors";

export type Ctx<P extends Record<string, string> = Record<string, string>> = { params: Promise<P> };

/** Envuelve un handler y devuelve siempre errores con el formato { error: { code, message } }. */
export function handle<P extends Record<string, string> = Record<string, string>>(
  fn: (req: Request, params: P) => Promise<Response>,
) {
  return async (req: Request, ctx?: Ctx<P>): Promise<Response> => {
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      return await fn(req, params);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) {
    return Response.json({ error: { code: e.code, message: e.message, ...e.extra } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const message = e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return Response.json({ error: { code: "validation_error", message } }, { status: 400 });
  }
  console.error(e);
  return Response.json({ error: { code: "internal_error", message: "Error interno" } }, { status: 500 });
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "El cuerpo debe ser JSON válido");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const url = new URL(req.url);
  return schema.parse(Object.fromEntries(url.searchParams));
}

export const ok = (data: unknown, status = 200) => Response.json(data, { status });

export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
