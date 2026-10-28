import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { config } from "../src/config";
import { useApp } from "../src/app-context";
import { Loading, P, Screen } from "../src/ui/components";

/** Apertura por Universal Link / App Link: https://<dominio>/t?d=...&c=... La URL completa se envía tal cual al backend. */
export default function TagLink() {
  const { submitScan } = useApp();
  const params = useLocalSearchParams<{ d?: string; c?: string }>();
  const url = Linking.useLinkingURL();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    const raw = url && url.startsWith("http") ? url : params.d && params.c ? `https://${config.appDomain}/t?d=${params.d}&c=${params.c}` : null;
    if (!raw) return;
    sent.current = true;
    submitScan(raw);
  }, [url, params.d, params.c, submitScan]);

  return (
    <Screen>
      <Loading />
      <P muted style={{ textAlign: "center" }}>Verificando tu frasco…</P>
    </Screen>
  );
}
