import { createCipheriv, createDecipheriv } from "node:crypto";
import { aesCmac } from "./cmac";
import { safeEqual } from "./crypto";
import { envOpt } from "./env";

/**
 * Verificación de la lectura segura SUN (Secure Unique NFC) de un NTAG 424 DNA.
 *
 * El tag escribe en la URL:  https://<dominio>/t?d=<PICCData cifrado, 32 hex>&c=<CMAC, 16 hex>
 *  - d = AES-128-CBC(IV=0, llave SDMMetaRead) de  [0xC7 | UID(7) | contador(3, LSB primero) | relleno]
 *  - c = CMAC truncado (bytes pares) con la llave de sesión derivada de la llave SDMFileRead,
 *        sobre una entrada vacía (sin datos de archivo reflejados).
 *
 * Diversificación (ver docs/NFC.md): a partir de la llave maestra de cada `key_ref`
 *  - llave SDMMetaRead  = CMAC(maestra, "SDM-META")            (común, hace falta para leer el UID)
 *  - llave SDMFileRead  = CMAC(maestra, "SDM-MAC" || UID)      (única por tag)
 */

export interface MasterKey {
  ref: string;
  key: Buffer;
}

export type SunResult =
  | { ok: true; uid: string; counter: number; keyRef: string }
  | { ok: false };

const ZERO_IV = Buffer.alloc(16);

export const deriveMetaKey = (master: Buffer) => aesCmac(master, Buffer.from("SDM-META"));

export const deriveFileKey = (master: Buffer, uid: Buffer) =>
  aesCmac(master, Buffer.concat([Buffer.from("SDM-MAC"), uid]));

/** "v1:hex32,v2:hex32" → llaves maestras (las del gestor de secretos / variables de Vercel). */
export function loadMasterKeys(raw = envOpt("NFC_MASTER_KEYS")): MasterKey[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [ref, hex] = pair.split(":");
      const key = Buffer.from(hex ?? "", "hex");
      if (!ref || key.length !== 16) throw new Error("NFC_MASTER_KEYS inválido: use ref:hex de 16 bytes");
      return { ref, key };
    });
}

const HEX32 = /^[0-9a-fA-F]{32}$/;
const HEX16 = /^[0-9a-fA-F]{16}$/;

/** Extrae d y c de la URL leída del tag. Devuelve null si no tiene la forma esperada. */
export function parseTagUrl(tagUrl: string, expectedHost?: string): { d: Buffer; c: Buffer } | null {
  let url: URL;
  try {
    url = new URL(tagUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.pathname !== "/t") return null;
  if (expectedHost && url.host.toLowerCase() !== expectedHost.toLowerCase()) return null;
  const d = url.searchParams.get("d");
  const c = url.searchParams.get("c");
  if (!d || !c || !HEX32.test(d) || !HEX16.test(c)) return null;
  return { d: Buffer.from(d, "hex"), c: Buffer.from(c, "hex") };
}

function truncateMac(full: Buffer): Buffer {
  return Buffer.from([1, 3, 5, 7, 9, 11, 13, 15].map((i) => full[i]));
}

export function verifySun(d: Buffer, c: Buffer, masters: MasterKey[]): SunResult {
  for (const m of masters) {
    const dec = createDecipheriv("aes-128-cbc", deriveMetaKey(m.key), ZERO_IV);
    dec.setAutoPadding(false);
    const plain = Buffer.concat([dec.update(d), dec.final()]);
    if (plain[0] !== 0xc7) continue; // UID de 7 bytes + contador reflejados
    const uid = plain.subarray(1, 8);
    const ctr = plain.subarray(8, 11);
    const sv2 = Buffer.concat([Buffer.from("3cc300010080", "hex"), uid, ctr]);
    const session = aesCmac(deriveFileKey(m.key, uid), sv2);
    const mac = truncateMac(aesCmac(session, Buffer.alloc(0)));
    if (safeEqual(mac, c)) {
      return { ok: true, uid: uid.toString("hex").toUpperCase(), counter: ctr.readUIntLE(0, 3), keyRef: m.ref };
    }
  }
  return { ok: false };
}

/** Genera la URL que escribiría un tag en la lectura `counter`. Sirve para pruebas y simuladores. */
export function buildSunUrl(opts: { baseUrl: string; uid: string; counter: number; master: MasterKey }): string {
  const uid = Buffer.from(opts.uid, "hex");
  const ctr = Buffer.alloc(3);
  ctr.writeUIntLE(opts.counter, 0, 3);
  const plain = Buffer.concat([Buffer.from([0xc7]), uid, ctr, Buffer.alloc(5)]);
  const enc = createCipheriv("aes-128-cbc", deriveMetaKey(opts.master.key), ZERO_IV);
  enc.setAutoPadding(false);
  const d = Buffer.concat([enc.update(plain), enc.final()]);
  const sv2 = Buffer.concat([Buffer.from("3cc300010080", "hex"), uid, ctr]);
  const session = aesCmac(deriveFileKey(opts.master.key, uid), sv2);
  const c = truncateMac(aesCmac(session, Buffer.alloc(0)));
  return `${opts.baseUrl.replace(/\/$/, "")}/t?d=${d.toString("hex").toUpperCase()}&c=${c.toString("hex").toUpperCase()}`;
}
