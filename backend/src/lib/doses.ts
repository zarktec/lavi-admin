import { DateTime } from "luxon";
import { addDays, isValidTime, localToUtc } from "./tz";
import { ApiError } from "./errors";

export interface DoseWindow {
  window_start: Date;
  window_end: Date;
  /** Fecha local (YYYY-MM-DD) del horario previsto de la dosis. */
  local_date?: string;
}

export interface DoseSpec {
  startDate: string; // YYYY-MM-DD en la zona de la usuaria
  durationDays: number;
  times: string[]; // HH:mm
  minutesBefore: number;
  minutesAfter: number;
  zone: string;
}

export function validateTimes(times: string[], dosesPerDay: number, before: number, after: number): string[] {
  if (!Array.isArray(times) || times.length !== dosesPerDay) {
    throw new ApiError(400, "invalid_times", `Debes indicar exactamente ${dosesPerDay} horario(s)`);
  }
  if (!times.every(isValidTime)) throw new ApiError(400, "invalid_times", "Los horarios deben tener formato HH:mm");
  const sorted = [...new Set(times)].sort();
  if (sorted.length !== times.length) throw new ApiError(400, "invalid_times", "Los horarios no pueden repetirse");
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  for (let i = 0; i < sorted.length; i++) {
    const a = toMin(sorted[i]);
    const b = i === sorted.length - 1 ? toMin(sorted[0]) + 1440 : toMin(sorted[i + 1]);
    if (sorted.length > 1 && b - a <= before + after) {
      throw new ApiError(400, "times_overlap", "Las ventanas de dos dosis se solapan; separa más los horarios");
    }
  }
  return sorted;
}

/** Genera de una vez todas las ventanas de dosis (en UTC) del tratamiento. */
export function buildDoseWindows(spec: DoseSpec): DoseWindow[] {
  const out: DoseWindow[] = [];
  for (let day = 0; day < spec.durationDays; day++) {
    const date = addDays(spec.startDate, day);
    for (const time of spec.times) {
      const at = DateTime.fromJSDate(localToUtc(date, time, spec.zone));
      out.push({
        window_start: at.minus({ minutes: spec.minutesBefore }).toJSDate(),
        window_end: at.plus({ minutes: spec.minutesAfter }).toJSDate(),
        local_date: date,
      });
    }
  }
  return out.sort((a, b) => a.window_start.getTime() - b.window_start.getTime());
}

export const overlaps = (a: DoseWindow, b: DoseWindow) => a.window_start < b.window_end && b.window_start < a.window_end;

/** Racha vigente: dosis a tiempo consecutivas que terminan en la dosis `index` (incluida). */
export function streakAt(statuses: string[], index: number): number {
  let n = 0;
  for (let i = index; i >= 0 && statuses[i] === "on_time"; i--) n++;
  return n;
}
