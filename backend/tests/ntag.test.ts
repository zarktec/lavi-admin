import { describe, expect, it } from "vitest";
import { aesCmac } from "@/lib/cmac";
import { buildSunUrl, loadMasterKeys, parseTagUrl, verifySun } from "@/lib/ntag";
import { simulateMaxCost } from "@/lib/simulator";

const KEY = Buffer.from("2b7e151628aed2a6abf7158809cf4f3c", "hex");

describe("AES-CMAC (RFC 4493)", () => {
  it("coincide con los vectores oficiales", () => {
    expect(aesCmac(KEY, Buffer.alloc(0)).toString("hex")).toBe("bb1d6929e95937287fa37d129b756746");
    expect(aesCmac(KEY, Buffer.from("6bc1bee22e409f96e93d7e117393172a", "hex")).toString("hex")).toBe("070a16b46b4d4144f79bdd9dd04a287c");
    const m40 = Buffer.from("6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411", "hex");
    expect(aesCmac(KEY, m40).toString("hex")).toBe("dfa66747de9ae63030ca32611497c827");
  });
});

describe("SUN del NTAG 424 DNA", () => {
  const master = loadMasterKeys()[0];
  const url = (counter: number, uid = "04A1B2C3D4E5F6") => buildSunUrl({ baseUrl: "https://app.example.com", uid, counter, master });

  it("verifica la firma y recupera UID y contador", () => {
    const p = parseTagUrl(url(7), "app.example.com")!;
    expect(verifySun(p.d, p.c, [master])).toEqual({ ok: true, uid: "04A1B2C3D4E5F6", counter: 7, keyRef: "v1" });
  });

  it("rechaza una firma alterada o llaves distintas", () => {
    const p = parseTagUrl(url(7), "app.example.com")!;
    const bad = Buffer.from(p.c);
    bad[0] ^= 1;
    expect(verifySun(p.d, bad, [master]).ok).toBe(false);
    expect(verifySun(p.d, p.c, [{ ref: "x", key: Buffer.alloc(16, 9) }]).ok).toBe(false);
  });

  it("rechaza dominios y rutas ajenos", () => {
    expect(parseTagUrl(url(1), "otro.com")).toBeNull();
    expect(parseTagUrl("https://app.example.com/x?d=00&c=00")).toBeNull();
    expect(parseTagUrl("http://app.example.com/t?d=" + "A".repeat(32) + "&c=" + "B".repeat(16))).toBeNull();
  });
});

describe("simulador de costo", () => {
  it("suma dosis, bienvenida y rachas, y respeta el tope", () => {
    const base = { doses_per_day: 2, duration_days: 10, points_per_dose: 10, welcome_points: 20, max_points_per_treatment: null, streak_rules: [{ streak_length: 5, bonus_points: 25, repeatable: true }] };
    expect(simulateMaxCost(base, 50)).toMatchObject({ total_doses: 20, dose_points: 200, streak_points: 100, max_points: 320, max_cost_cop: 16000, capped: false });
    expect(simulateMaxCost({ ...base, max_points_per_treatment: 250 }, 50)).toMatchObject({ max_points: 250, capped: true });
  });
});
