import type {
  AppConfig, CreateTreatmentRequest, LedgerPage, Me, PointsInfo, Redemption, RedemptionOptions,
  ScanRequest, ScanResponse, Session, TreatmentDetail, TreatmentSummary,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Sin conexión o el servidor no respondió. */
export class NetworkError extends Error {
  constructor() {
    super("Sin conexión");
  }
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

export interface TokenStore {
  get(): Promise<Tokens | null>;
  set(t: Tokens | null): Promise<void>;
}

export interface ClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetchImpl?: typeof fetch;
  /** Se llama cuando la sesión ya no se puede renovar. */
  onSessionLost?: () => void;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";
interface ReqOpts {
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
  query?: Record<string, string | number | undefined>;
}

export function createClient(opts: ClientOptions) {
  const f = opts.fetchImpl ?? fetch;
  let refreshing: Promise<boolean> | null = null;

  async function raw(method: Method, path: string, o: ReqOpts, token: string | null): Promise<Response> {
    const qs = o.query
      ? "?" + Object.entries(o.query).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")
      : "";
    const headers: Record<string, string> = { Accept: "application/json", ...o.headers };
    if (o.body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      return await f(`${opts.baseUrl}${path}${qs}`, { method, headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
    } catch {
      throw new NetworkError();
    }
  }

  async function parse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* cuerpo vacío */
    }
    if (!res.ok) {
      const e = data?.error;
      throw new ApiError(res.status, e?.code ?? "unknown_error", e?.message ?? "Algo salió mal. Intenta de nuevo.");
    }
    return data as T;
  }

  /** Renueva con el token de renovación (rotativo). Una sola renovación a la vez. */
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      try {
        const t = await opts.tokens.get();
        if (!t) return false;
        const res = await raw("POST", "/v1/auth/refresh", { body: { refresh_token: t.refresh_token } }, null);
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            await opts.tokens.set(null);
            opts.onSessionLost?.();
          }
          return false;
        }
        const s = (await res.json()) as Session;
        await opts.tokens.set({ access_token: s.access_token, refresh_token: s.refresh_token });
        return true;
      } catch {
        return false; // sin red: conservamos la sesión
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function request<T>(method: Method, path: string, o: ReqOpts = {}): Promise<T> {
    const auth = o.auth !== false;
    let t = auth ? await opts.tokens.get() : null;
    if (auth && !t) throw new ApiError(401, "unauthorized", "Inicia sesión para continuar");
    let res = await raw(method, path, o, t?.access_token ?? null);
    if (auth && res.status === 401) {
      if (await refresh()) {
        t = await opts.tokens.get();
        res = await raw(method, path, o, t?.access_token ?? null);
      }
    }
    return parse<T>(res);
  }

  return {
    request,
    // ── público
    getConfig: () => request<AppConfig>("GET", "/v1/config/app", { auth: false }),
    // ── sesión
    createSession: (body: { shopify_access_token: string; timezone?: string; data_consent?: boolean }) =>
      request<Session>("POST", "/v1/auth/session", { body, auth: false }),
    async deleteSession() {
      const t = await opts.tokens.get();
      if (!t) return;
      await request<void>("DELETE", "/v1/auth/session", { headers: { "X-Refresh-Token": t.refresh_token } });
    },
    // ── perfil
    getMe: () => request<Me>("GET", "/v1/me"),
    updateMe: (body: { name?: string; timezone?: string; accept_data_policy?: true }) => request<Me>("PATCH", "/v1/me", { body }),
    deleteMe: () => request<void>("DELETE", "/v1/me"),
    registerDevice: (body: { push_token: string; platform: "ios" | "android" }) => request<{ id: string }>("POST", "/v1/devices", { body }),
    removeDevice: (id: string) => request<void>("DELETE", `/v1/devices/${id}`),
    // ── lecturas y tratamientos
    scan: (body: ScanRequest) => request<ScanResponse>("POST", "/v1/scans", { body }),
    createTreatment: (body: CreateTreatmentRequest) => request<TreatmentDetail>("POST", "/v1/treatments", { body }),
    listTreatments: () => request<{ treatments: TreatmentSummary[] }>("GET", "/v1/treatments").then((r) => r.treatments),
    getTreatment: (id: string) => request<TreatmentDetail>("GET", `/v1/treatments/${id}`),
    updateSchedule: (id: string, reminder_times: string[]) =>
      request<TreatmentDetail>("PATCH", `/v1/treatments/${id}/schedule`, { body: { reminder_times } }),
    // ── puntos y canjes
    getPoints: () => request<PointsInfo>("GET", "/v1/points"),
    getLedger: (before?: number) => request<LedgerPage>("GET", "/v1/points/ledger", { query: { limit: 30, before } }),
    getRedemptionOptions: () => request<RedemptionOptions>("GET", "/v1/redemptions/options"),
    redeem: (option_id: string, idempotencyKey: string) =>
      request<Redemption>("POST", "/v1/redemptions", { body: { option_id }, headers: { "Idempotency-Key": idempotencyKey } }),
    listRedemptions: () => request<{ redemptions: Redemption[] }>("GET", "/v1/redemptions").then((r) => r.redemptions),
  };
}

export type Api = ReturnType<typeof createClient>;
