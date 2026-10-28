import { describe, expect, it } from "vitest";
import { describeScan, rejectMessages } from "../src/lib/results";
import { versionLt } from "../src/lib/version";

describe("describeScan", () => {
  it("muestra puntos, bono, racha y saldo de una dosis a tiempo", () => {
    const v = describeScan({ result: "dose_recorded", dose_id: "d", points_earned: 10, bonus_points: 5, streak: 2, balance: 45, next_dose: null, treatment_completed: false });
    expect(v.tone).toBe("success");
    expect(v.message).toContain("10 puntos");
    expect(v.message).toContain("5 de bono");
    expect(v.message).toContain("45");
    expect(v.refreshReminders).toBe(true);
  });
  it("tardía no promete puntos y too_early no reprograma", () => {
    expect(describeScan({ result: "late", dose_id: "d", points_earned: 0, balance: 1, next_dose: null, treatment_completed: false }).tone).toBe("warning");
    expect(describeScan({ result: "too_early", opens_at: "2026-03-02T12:00:00Z", window_end: "2026-03-02T14:00:00Z", dose_id: "d" }).refreshReminders).toBe(false);
  });
  it("sugiere recompra al terminar", () => {
    expect(describeScan({ result: "treatment_finished", treatment_id: "t", repurchase_suggested: true }).suggestRepurchase).toBe(true);
  });
  it("cubre todos los motivos de rechazo", () => {
    for (const reason of Object.keys(rejectMessages) as (keyof typeof rejectMessages)[]) {
      const v = describeScan({ result: "rejected", reason });
      expect(v.tone).toBe("error");
      expect(v.message.length).toBeGreaterThan(10);
    }
  });
  it("activation_required abre el flujo de activación", () => {
    const v = describeScan({ result: "activation_required", activation_token: "t", expires_in: 900, product: { id: "p", name: "Tónico" }, variant: { id: "v", name: "100 ml", volume_ml: 100 }, suggested_times: ["08:00"], config: { doses_per_day: 1, duration_days: 30, points_per_dose: 10, welcome_points: 20, window_minutes_before: 60, window_minutes_after: 60, schedule_change_min_notice_hours: 2 } });
    expect(v.activation).toBe(true);
  });
});

describe("versionLt", () => {
  it("compara versiones", () => {
    expect(versionLt("1.0.0", "1.0.1")).toBe(true);
    expect(versionLt("1.2", "1.10.0")).toBe(true);
    expect(versionLt("2.0.0", "1.9.9")).toBe(false);
    expect(versionLt("1.0.0", "1.0")).toBe(false);
  });
});
