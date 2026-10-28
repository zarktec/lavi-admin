import { describe, expect, it } from "vitest";
import { GET } from "@/app/auth/callback/route";
import { appCallbackUrl, authCallbackHtml } from "@/lib/auth-callback";

describe("puente de inicio de sesión (/auth/callback)", () => {
  it("reenvía los parámetros al esquema de la app", () => {
    expect(appCallbackUrl("lavi", "?code=abc&state=xyz")).toBe("lavi://auth/callback?code=abc&state=xyz");
    expect(appCallbackUrl("lavi", "")).toBe("lavi://auth/callback");
  });

  it("el destino nunca viene de la petición", async () => {
    const res = GET(new Request("https://app.example.com/auth/callback?code=1&redirect=https://evil.com"));
    const html = await res.text();
    expect(html).toContain("lavi://auth/callback?code=1&redirect=https://evil.com");
    expect(html).not.toMatch(/location\.replace\("https:\/\/evil/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("escapa HTML y no permite cerrar el script", () => {
    const html = authCallbackHtml(appCallbackUrl("lavi", '?x="></script><script>alert(1)</script>'));
    expect(html).not.toContain("</script><script>alert(1)");
  });
});
