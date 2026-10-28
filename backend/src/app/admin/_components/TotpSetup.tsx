"use client";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** Muestra el QR del otpauth:// y el secreto en texto por si no se puede escanear. */
export function TotpSetup({ uri, secret }: { uri: string; secret?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(uri, { margin: 1, width: 200 }).then(setSrc).catch(() => setSrc(""));
  }, [uri]);
  const key = secret ?? new URL(uri).searchParams.get("secret") ?? "";
  return (
    <div>
      <p>Escanea este código con tu app autenticadora (Google Authenticator, Authy, 1Password…).</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img className="qr" src={src} alt="Código QR para la verificación en dos pasos" />}
      <p>¿No puedes escanear? Escribe esta clave:</p>
      <div className="secret">{key}</div>
    </div>
  );
}
