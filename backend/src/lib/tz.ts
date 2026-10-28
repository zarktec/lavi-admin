import { DateTime } from "luxon";

export function isValidZone(zone: string): boolean {
  return DateTime.now().setZone(zone).isValid;
}

export const isValidTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Fecha local (YYYY-MM-DD) de un instante en la zona de la usuaria. */
export function localDate(at: Date, zone: string): string {
  return DateTime.fromJSDate(at, { zone }).toISODate()!;
}

/** Hora local de la usuaria → instante UTC. */
export function localToUtc(date: string, time: string, zone: string): Date {
  return DateTime.fromISO(`${date}T${time}`, { zone }).toUTC().toJSDate();
}

export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: "utc" }).plus({ days }).toISODate()!;
}
