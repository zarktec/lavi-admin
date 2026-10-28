import { Linking, Platform } from "react-native";
import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager";

export type NfcStatus = "ok" | "unsupported" | "disabled";

/** Verificación de NFC al primer uso: soporte del teléfono y (Android) si está encendido. */
export async function checkNfc(): Promise<NfcStatus> {
  try {
    if (!(await NfcManager.isSupported())) return "unsupported";
    await NfcManager.start();
    if (Platform.OS === "android" && !(await NfcManager.isEnabled())) return "disabled";
    return "ok";
  } catch {
    return "unsupported";
  }
}

export function openNfcSettings() {
  if (Platform.OS === "android") return NfcManager.goToNfcSetting();
  return Linking.openSettings();
}

export class NfcCancelled extends Error {}

/** Lee el primer registro URI del tag en primer plano. La URL se devuelve tal cual, sin interpretarla. */
export async function readTagUrl(): Promise<string> {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage: "Acerca la parte superior del teléfono al tag del frasco",
    });
    const tag = await NfcManager.getTag();
    const record = tag?.ndefMessage?.find((r) => r.tnf === Ndef.TNF_WELL_KNOWN && r.type.length === 1 && r.type[0] === 0x55);
    if (!record) throw new Error("El tag no contiene un enlace");
    return Ndef.uri.decodePayload(new Uint8Array(record.payload) as any) as string;
  } catch (e: any) {
    if (e instanceof NfcCancelled) throw e;
    if (String(e?.constructor?.name).includes("UserCancel") || e?.message === "cancelled") throw new NfcCancelled();
    throw e;
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export const cancelRead = () => NfcManager.cancelTechnologyRequest().catch(() => {});
