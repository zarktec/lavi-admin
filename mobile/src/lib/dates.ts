export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;
export const fmtDay = (isoDate: string) => new Date(isoDate + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

/** Racha actual para mostrar: dosis a tiempo consecutivas hasta la última dosis ya resuelta. */
export function displayStreak(statuses: string[]): number {
  let i = statuses.length - 1;
  while (i >= 0 && statuses[i] === "scheduled") i--;
  let n = 0;
  for (; i >= 0 && statuses[i] === "on_time"; i--) n++;
  return n;
}
