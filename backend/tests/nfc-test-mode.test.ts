import { afterEach, describe, expect, it, vi } from "vitest";
import { insecureTestModeEnabled, parseTestTagUrl } from "@/lib/ntag";

const URL_OK = "https://app.example.com/t?uid=048d34b22e6180";

describe("modo de pruebas de tags sin SUN: reglas de activación", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("apagado por defecto", () => {
    expect(insecureTestModeEnabled()).toBe(false);
    expect(parseTestTagUrl(URL_OK)).toBeNull();
  });

  it("encendido fuera de producción", () => {
    vi.stubEnv("NFC_INSECURE_TEST_MODE", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(insecureTestModeEnabled()).toBe(true);
    expect(parseTestTagUrl(URL_OK)).toBe("048D34B22E6180");
  });

  it("en producción NO se activa solo con NFC_INSECURE_TEST_MODE", () => {
    vi.stubEnv("NFC_INSECURE_TEST_MODE", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(insecureTestModeEnabled()).toBe(false);
    expect(parseTestTagUrl(URL_OK)).toBeNull();
  });

  it("en producción exige la excepción explícita y avisa en el registro", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NFC_INSECURE_TEST_MODE", "1");
    vi.stubEnv("NFC_INSECURE_TEST_MODE_ALLOW_PRODUCTION", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(insecureTestModeEnabled()).toBe(true);
    expect(parseTestTagUrl(URL_OK)).toBe("048D34B22E6180");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("SIN FIRMA"));
    warn.mockRestore();
  });

  it("la excepción sola no activa el modo", () => {
    vi.stubEnv("NFC_INSECURE_TEST_MODE_ALLOW_PRODUCTION", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(insecureTestModeEnabled()).toBe(false);
  });

  it("valida host y formato del UID", () => {
    vi.stubEnv("NFC_INSECURE_TEST_MODE", "1");
    expect(parseTestTagUrl(URL_OK, "otro.com")).toBeNull();
    expect(parseTestTagUrl("https://app.example.com/t?uid=XYZ")).toBeNull();
  });
});
