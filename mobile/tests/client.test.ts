import { describe, expect, it } from "vitest";
import { ApiError, NetworkError, createClient, type Tokens } from "../src/api/client";

function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  let tokens: Tokens | null = { access_token: "old", refresh_token: "r1" };
  const calls: { url: string; init: RequestInit }[] = [];
  let lost = 0;
  const client = createClient({
    baseUrl: "http://api",
    tokens: { get: async () => tokens, set: async (t) => void (tokens = t) },
    fetchImpl: (async (url: string, init: RequestInit) => (calls.push({ url, init }), handler(url, init))) as any,
    onSessionLost: () => lost++,
  });
  return { client, calls, tokens: () => tokens, lost: () => lost };
}
const j = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("cliente de la API", () => {
  it("renueva el token al recibir 401 y reintenta; varias peticiones comparten una renovación", async () => {
    let refreshes = 0;
    const t = setup((url, init) => {
      if (url.endsWith("/v1/auth/refresh")) {
        refreshes++;
        return j(200, { access_token: "new", refresh_token: "r2", expires_in: 900 });
      }
      return (init.headers as any).Authorization === "Bearer new" ? j(200, { balance: 5, value_cop: 1, upcoming_expirations: [] }) : j(401, { error: { code: "token_expired", message: "x" } });
    });
    const [a, b] = await Promise.all([t.client.getPoints(), t.client.getPoints()]);
    expect(a.balance).toBe(5);
    expect(b.balance).toBe(5);
    expect(refreshes).toBe(1);
    expect(t.tokens()).toEqual({ access_token: "new", refresh_token: "r2" });
  });

  it("si la renovación es rechazada limpia la sesión y avisa", async () => {
    const t = setup((url) => (url.endsWith("/refresh") ? j(401, { error: { code: "invalid_refresh_token", message: "x" } }) : j(401, { error: { code: "token_expired", message: "x" } })));
    await expect(t.client.getMe()).rejects.toMatchObject({ status: 401 });
    expect(t.tokens()).toBeNull();
    expect(t.lost()).toBe(1);
  });

  it("envía Idempotency-Key en los canjes y devuelve errores con código", async () => {
    const t = setup(() => j(409, { error: { code: "insufficient_points", message: "No tienes puntos suficientes" } }));
    const err = await t.client.redeem("opt", "key-123456789").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("insufficient_points");
    expect((t.calls[0].init.headers as any)["Idempotency-Key"]).toBe("key-123456789");
  });

  it("distingue la falta de red y arma query y cuerpos", async () => {
    const t = setup(() => {
      throw new Error("offline");
    });
    await expect(t.client.getLedger(10)).rejects.toBeInstanceOf(NetworkError);
    expect(t.calls[0].url).toBe("http://api/v1/points/ledger?limit=30&before=10");
  });

  it("el config no exige sesión", async () => {
    const t = setup(() => j(200, { min_app_version: "1.0.0" }));
    await t.client.request("GET", "/v1/config/app", { auth: false });
    expect((t.calls[0].init.headers as any).Authorization).toBeUndefined();
  });
});
