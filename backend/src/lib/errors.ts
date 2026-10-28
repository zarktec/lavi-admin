export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (code: string, message?: string) => new ApiError(400, code, message);
export const unauthorized = (code = "unauthorized", message = "Sesión inválida o vencida") =>
  new ApiError(401, code, message);
export const forbidden = (code = "forbidden", message = "No tienes permiso para esto") =>
  new ApiError(403, code, message);
export const notFound = (code = "not_found", message = "No encontrado") => new ApiError(404, code, message);
export const conflict = (code: string, message?: string) => new ApiError(409, code, message);
