import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useApp } from "../src/app-context";
import { NfcCancelled, cancelRead, checkNfc, openNfcSettings, readTagUrl, type NfcStatus } from "../src/nfc/nfc";
import { Banner, Button, H1, Loading, P, Screen } from "../src/ui/components";

export default function Scan() {
  const { submitScan } = useApp();
  const [nfc, setNfc] = useState<NfcStatus | "checking">("checking");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const active = useRef(true);

  const read = useCallback(async () => {
    setError(null);
    setReading(true);
    try {
      const url = await readTagUrl();
      if (active.current) await submitScan(url);
    } catch (e) {
      if (!(e instanceof NfcCancelled) && active.current) setError("No pudimos leer el tag. Acerca la parte superior del teléfono al frasco y mantenlo quieto un momento.");
    } finally {
      if (active.current) setReading(false);
    }
  }, [submitScan]);

  const verify = useCallback(async () => {
    setNfc("checking");
    const s = await checkNfc();
    if (s === "unsupported") return router.replace("/nfc-unsupported");
    setNfc(s);
    if (s === "ok") read();
  }, [read]);

  useEffect(() => {
    active.current = true;
    verify();
    return () => {
      active.current = false;
      cancelRead();
    };
  }, [verify]);

  if (nfc === "checking") return <Screen><Loading /></Screen>;

  if (nfc === "disabled") {
    return (
      <Screen>
        <H1>Activa el NFC</H1>
        <P>El NFC está apagado. Para activarlo:</P>
        <P>1. Abre los ajustes de conexiones de tu teléfono.{"\n"}2. Enciende “NFC” (en algunos equipos aparece como “NFC y pago sin contacto”).{"\n"}3. Vuelve aquí y toca “Ya lo activé”.</P>
        <Button title="Abrir ajustes de NFC" onPress={() => openNfcSettings()} />
        <Button title="Ya lo activé" variant="secondary" onPress={verify} />
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>Acerca tu teléfono al frasco</H1>
      <P>Apoya la parte superior del teléfono sobre el tag NFC del frasco y espera la vibración.</P>
      {reading && Platform.OS === "android" && <Loading />}
      {error && <Banner tone="error">{error}</Banner>}
      <Button title={reading ? "Leyendo…" : "Intentar de nuevo"} onPress={read} disabled={reading} />
      <Button title="Cancelar" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
