import type { RejectReason, ScanResponse } from "../api/types";

export type Tone = "success" | "info" | "warning" | "error";

export interface ScanView {
  tone: Tone;
  icon: string;
  title: string;
  message: string;
  /** La pantalla de activación tiene su propio flujo. */
  activation?: boolean;
  /** Tras esta lectura conviene reprogramar los recordatorios. */
  refreshReminders: boolean;
  suggestRepurchase?: boolean;
}

export const rejectMessages: Record<RejectReason, { title: string; message: string }> = {
  invalid_signature: { title: "Tag no válido", message: "No pudimos verificar este tag. Asegúrate de acercar el teléfono al tag original del frasco." },
  replayed: { title: "Lectura ya usada", message: "Este enlace ya fue usado o es una copia. Acerca el teléfono al frasco para hacer una lectura nueva." },
  owned_by_other: { title: "Frasco de otra cuenta", message: "Este frasco está activado en otra cuenta. Si crees que es un error, escríbenos." },
  blocked: { title: "Frasco bloqueado", message: "Este frasco fue bloqueado y no suma puntos. Contacta a servicio al cliente." },
  offline_expired: { title: "Lectura vencida", message: "Esta lectura se hizo sin conexión y llegó fuera del plazo permitido o fuera de la ventana de la dosis, por eso no cuenta." },
};

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });

/** Traduce el `result` del backend a lo que muestra la app. No decide nada: solo presenta. */
export function describeScan(r: ScanResponse): ScanView {
  switch (r.result) {
    case "activation_required":
      return { tone: "info", icon: "✨", title: "Frasco nuevo", message: `Activa ${r.product.name} (${r.variant.name}) para empezar tu tratamiento.`, activation: true, refreshReminders: false };
    case "dose_recorded": {
      const bonus = r.bonus_points > 0 ? ` + ${r.bonus_points} de bono por racha` : "";
      const done = r.treatment_completed ? " ¡Completaste tu tratamiento!" : "";
      return { tone: "success", icon: "✅", title: "¡Dosis a tiempo!", message: `Ganaste ${r.points_earned} puntos${bonus}. Racha: ${r.streak}. Saldo: ${r.balance} puntos.${done}`, refreshReminders: true, suggestRepurchase: r.treatment_completed };
    }
    case "too_early":
      return { tone: "info", icon: "⏳", title: "Aún no es la hora", message: `Tu ventana abre a las ${fmtTime(r.opens_at)}. Vuelve a acercar el teléfono entonces.`, refreshReminders: false };
    case "late":
      return { tone: "warning", icon: "⌛", title: "Dosis registrada tarde", message: "Tu ventana ya había cerrado, así que esta dosis no suma puntos. ¡La próxima llega a tiempo!", refreshReminders: true, suggestRepurchase: r.treatment_completed };
    case "no_pending_dose":
      return { tone: "info", icon: "👍", title: "Sin dosis pendiente", message: r.next_dose ? `No hay una dosis pendiente ahora. La siguiente abre a las ${fmtTime(r.next_dose.window_start)}.` : "No hay una dosis pendiente en este momento.", refreshReminders: false };
    case "treatment_finished":
      return { tone: "success", icon: "🎉", title: "Tratamiento completado", message: "Este frasco ya terminó su tratamiento. ¿Quieres reordenar para no interrumpir tu progreso?", refreshReminders: true, suggestRepurchase: true };
    case "rejected": {
      const m = rejectMessages[r.reason] ?? { title: "Lectura rechazada", message: "No pudimos registrar esta lectura." };
      return { tone: "error", icon: "⛔", ...m, refreshReminders: false };
    }
  }
}

/** Mensajes de error de la API para códigos conocidos. */
export const errorMessages: Record<string, string> = {
  active_treatment_exists: "Ya tienes un tratamiento activo.",
  tag_already_claimed: "Este frasco ya fue activado.",
  tag_blocked: "Este frasco está bloqueado.",
  activation_token_invalid: "La activación venció. Acerca de nuevo el teléfono al frasco.",
  schedule_change_limit: "Alcanzaste el límite de cambios de horario para este periodo.",
  schedule_unchanged: "Los horarios son los mismos.",
  times_overlap: "Las ventanas de dos dosis se solapan; separa más los horarios.",
  insufficient_points: "No tienes puntos suficientes.",
  below_minimum: "Aún no alcanzas el mínimo de puntos para redimir.",
  shopify_unavailable: "No pudimos generar tu código. Tus puntos fueron devueltos; intenta de nuevo.",
  request_in_progress: "Tu canje ya se está procesando.",
};
