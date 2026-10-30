"use client";

export class ApiErr extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface Opts {
  method?: string;
  body?: unknown;
  /** No redirigir a login en 401 (para las propias pantallas de acceso). */
  noRedirect?: boolean;
}

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const res = await fetch(`/v1/admin${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    credentials: "same-origin",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return null as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error ?? { code: "error", message: `Error ${res.status}` };
    if (res.status === 401 && !opts.noRedirect && typeof window !== "undefined") {
      const reason = e.code === "session_expired" ? "expired" : "login";
      window.location.href = `/admin/login?reason=${reason}`;
    }
    throw new ApiErr(res.status, e.code, e.message);
  }
  return data as T;
}

export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—");
export const fmtDay = (d?: string | null) => (d ? new Date(d).toLocaleDateString("es-CO") : "—");
export const cop = (n?: number | null) => (n == null ? "—" : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n));
export const pct = (n?: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)} %`);
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Número con separador de miles (es-CO). */
export const num = (n?: number | null) => (n == null ? "—" : new Intl.NumberFormat("es-CO").format(n));
/** Iniciales para avatares. */
export const initials = (name?: string | null) => (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
