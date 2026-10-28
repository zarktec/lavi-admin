import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Api } from "../api/client";
import type { NotificationTexts } from "../api/types";
import { isReminderOfDose, planReminders, type ReminderSource } from "../lib/reminders";

const CHANNEL = "reminders";

export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

async function ensureChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Recordatorios de aplicación",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

export async function permissionState(): Promise<"granted" | "denied" | "undetermined"> {
  const p = await Notifications.getPermissionsAsync();
  return p.granted ? "granted" : p.canAskAgain ? "undetermined" : "denied";
}

/** Pide el permiso de forma contextual (al activar un frasco o desde Inicio), nunca al abrir la app por primera vez. */
export async function requestNotificationPermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Reprograma todos los recordatorios locales a partir de las dosis del backend.
 * Se llama al abrir la app, tras cada lectura y tras cambiar horarios.
 */
export async function rescheduleReminders(api: Api, texts: NotificationTexts, now = new Date()): Promise<number> {
  if (!(await Notifications.getPermissionsAsync()).granted) return 0;
  await ensureChannel();
  const active = (await api.listTreatments()).filter((t) => t.status === "active");
  const sources: ReminderSource[] = await Promise.all(
    active.map(async (t) => {
      const d = await api.getTreatment(t.id);
      return { productName: t.product.name, nudges: t.config.reminder_nudges, doses: d.doses };
    }),
  );
  const plan = planReminders(sources, texts, now);
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const p of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, body: p.body, data: { doseId: p.doseId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.fireAt, channelId: CHANNEL },
    });
  }
  return plan.length;
}

/** Cancela las insistencias pendientes de una dosis ya registrada. */
export async function cancelDoseReminders(doseId: string) {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(pending.filter((n) => isReminderOfDose(n.identifier, doseId)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

export const cancelAllReminders = () => Notifications.cancelAllScheduledNotificationsAsync();

/** Token push de Expo (push de respaldo). Devuelve null si no se puede (simulador, sin permiso). */
export async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (!(await Notifications.getPermissionsAsync()).granted) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync()).data;
  } catch {
    return null;
  }
}
