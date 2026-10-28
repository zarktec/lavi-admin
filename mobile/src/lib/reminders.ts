import type { NotificationTexts } from "../api/types";

export interface ReminderDose {
  id: string;
  window_start: string;
  window_end: string;
  status: string;
}

export interface ReminderSource {
  productName: string;
  /** Minutos desde la apertura de la ventana en que se insiste (config.reminder_nudges). */
  nudges: number[];
  doses: ReminderDose[];
}

export interface PlannedReminder {
  /** `dose:<doseId>:<minutosDesdeApertura>` — permite cancelar las de una dosis. */
  id: string;
  doseId: string;
  fireAt: Date;
  title: string;
  body: string;
  isNudge: boolean;
}

// iOS conserva como máximo 64 notificaciones locales pendientes; dejamos margen.
export const IOS_PENDING_LIMIT = 60;

export const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

export const reminderId = (doseId: string, offsetMin: number) => `dose:${doseId}:${offsetMin}`;
export const isReminderOfDose = (identifier: string, doseId: string) => identifier.startsWith(`dose:${doseId}:`);

/**
 * Calcula qué notificaciones locales programar: al abrir cada ventana y las insistencias
 * dentro de ella, solo de dosis pendientes y futuras, las próximas `limit` en orden cronológico.
 */
export function planReminders(sources: ReminderSource[], texts: NotificationTexts, now: Date, limit = IOS_PENDING_LIMIT): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (const s of sources) {
    const vars = { product: s.productName };
    const offsets = [...new Set([0, ...s.nudges])].filter((n) => n >= 0).sort((a, b) => a - b);
    for (const d of s.doses) {
      if (d.status !== "scheduled") continue;
      const start = new Date(d.window_start).getTime();
      const end = new Date(d.window_end).getTime();
      for (const off of offsets) {
        const at = start + off * 60_000;
        if (at <= now.getTime() || at >= end) continue;
        out.push({
          id: reminderId(d.id, off),
          doseId: d.id,
          fireAt: new Date(at),
          title: fill(texts.reminder_title, vars),
          body: fill(off === 0 ? texts.reminder_body : texts.nudge_body, vars),
          isNudge: off !== 0,
        });
      }
    }
  }
  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, Math.max(0, limit));
}
