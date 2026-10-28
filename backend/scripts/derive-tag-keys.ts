import { deriveFileKey, deriveMetaKey, loadMasterKeys } from "../src/lib/ntag";

// Para programar los tags internamente (o entregar las llaves al fabricante sin conservarlas):
//   NFC_MASTER_KEYS=v1:<hex> npm run derive-tag-keys -- v1 04A1B2C3D4E5F6
const [ref, uid] = process.argv.slice(2);
if (!ref || !/^[0-9A-Fa-f]{14}$/.test(uid ?? "")) {
  console.error("Uso: npm run derive-tag-keys -- <key_ref> <UID de 14 hex>");
  process.exit(1);
}
const master = loadMasterKeys().find((k) => k.ref === ref);
if (!master) {
  console.error(`No hay llave maestra con ref "${ref}" en NFC_MASTER_KEYS`);
  process.exit(1);
}
console.log(JSON.stringify({
  uid: uid.toUpperCase(),
  key_ref: ref,
  sdm_meta_read_key: deriveMetaKey(master.key).toString("hex"),
  sdm_file_read_key: deriveFileKey(master.key, Buffer.from(uid, "hex")).toString("hex"),
}, null, 2));
