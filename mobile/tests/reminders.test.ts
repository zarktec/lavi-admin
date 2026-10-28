import { describe, expect, it } from "vitest";
import { isReminderOfDose, planReminders } from "../src/lib/reminders";

const texts = {
  reminder_title: "Hora de {product}", reminder_body: "Aplica {product}", nudge_body: "Aún falta {product}",
  backup_title: "", backup_body: "", repurchase_title: "", repurchase_body: "",
};
const dose = (id: string, start: string, end: string, status = "scheduled") => ({ id, window_start: start, window_end: end, status });

describe("planReminders", () => {
  const now = new Date("2026-03-02T11:00:00Z");

  it("programa la apertura y las insistencias dentro de la ventana, con los textos del backend", () => {
    const plan = planReminders([{ productName: "Tónico", nudges: [0, 15, 30], doses: [dose("a", "2026-03-02T12:00:00Z", "2026-03-02T14:00:00Z")] }], texts, now);
    expect(plan.map((p) => [p.id, p.fireAt.toISOString().slice(11, 16), p.isNudge])).toEqual([
      ["dose:a:0", "12:00", false], ["dose:a:15", "12:15", true], ["dose:a:30", "12:30", true],
    ]);
    expect(plan[0]).toMatchObject({ title: "Hora de Tónico", body: "Aplica Tónico" });
    expect(plan[1].body).toBe("Aún falta Tónico");
  });

  it("omite dosis resueltas, momentos pasados y los que caen fuera de la ventana", () => {
    const plan = planReminders(
      [{ productName: "T", nudges: [45, 500], doses: [
        dose("done", "2026-03-02T12:00:00Z", "2026-03-02T14:00:00Z", "on_time"),
        dose("past", "2026-03-02T09:00:00Z", "2026-03-02T10:00:00Z"),
        dose("open", "2026-03-02T10:30:00Z", "2026-03-02T13:00:00Z"),
      ] }],
      texts, now,
    );
    expect(plan.map((p) => p.id)).toEqual(["dose:open:45"]); // apertura ya pasó; 500 min excede la ventana
  });

  it("respeta el límite de iOS tomando las más próximas de varios tratamientos", () => {
    const doses = Array.from({ length: 40 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 2, 3 + i, 12));
      return dose(`d${i}`, d.toISOString(), new Date(d.getTime() + 7200_000).toISOString());
    });
    const plan = planReminders([{ productName: "T", nudges: [15], doses }, { productName: "U", nudges: [], doses: [dose("u", "2026-03-02T15:00:00Z", "2026-03-02T16:00:00Z")] }], texts, now, 60);
    expect(plan).toHaveLength(60);
    expect(plan[0].id).toBe("dose:u:0");
    expect([...plan].sort((a, b) => +a.fireAt - +b.fireAt)).toEqual(plan);
  });

  it("identifica las notificaciones de una dosis para cancelarlas", () => {
    expect(isReminderOfDose("dose:abc:15", "abc")).toBe(true);
    expect(isReminderOfDose("dose:abcd:15", "abc")).toBe(false);
  });
});
