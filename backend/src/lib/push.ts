import type { Db } from "./db";

interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Push de respaldo vía servicio de Expo (APNs y FCM). Elimina tokens que Expo reporta como inválidos. */
export async function sendPush(db: Db, userId: string, msg: PushMessage): Promise<number> {
  const devices = await db.many<{ id: string; push_token: string }>("select id, push_token from devices where user_id = $1", [userId]);
  if (!devices.length) return 0;
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(devices.map((d) => ({ to: d.push_token, title: msg.title, body: msg.body, data: msg.data, sound: "default" }))),
  });
  if (!res.ok) return 0;
  const { data } = (await res.json()) as { data: { status: string; details?: { error?: string } }[] };
  let sent = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i].status === "ok") sent++;
    else if (data[i].details?.error === "DeviceNotRegistered") await db.exec("delete from devices where id = $1", [devices[i].id]);
  }
  return sent;
}

export const fillTemplate = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
