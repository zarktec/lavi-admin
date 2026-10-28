import { headers } from "next/headers";
import { envOpt } from "@/lib/env";

export const dynamic = "force-dynamic";

// Página de respaldo del enlace del tag: si la app no está instalada, lleva a la tienda de apps.
export default async function TagFallback() {
  const ua = (await headers()).get("user-agent") ?? "";
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  const iosUrl = envOpt("IOS_STORE_URL");
  const androidUrl = envOpt("ANDROID_STORE_URL");
  const target = ios ? iosUrl : android ? androidUrl : "";
  return (
    <main style={{ maxWidth: 420, margin: "12vh auto", padding: 24, textAlign: "center" }}>
      <h1>Descarga la app</h1>
      <p>Para registrar tu aplicación necesitas la app instalada en un celular con NFC.</p>
      {target ? (
        <a href={target} style={{ display: "inline-block", padding: "12px 20px", background: "#2f5d50", color: "#fff", borderRadius: 8, textDecoration: "none" }}>
          Ir a la tienda de apps
        </a>
      ) : (
        <p>
          <a href={iosUrl}>App Store</a> · <a href={androidUrl}>Google Play</a>
        </p>
      )}
      {target && <meta httpEquiv="refresh" content={`0;url=${target}`} />}
    </main>
  );
}
