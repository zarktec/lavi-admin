"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { TotpSetup } from "../_components/TotpSetup";
import { Field } from "../_components/ui";
import { api } from "../_lib/api";

function InviteForm() {
  const token = useSearchParams().get("token") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [totp, setTotp] = useState<{ uri: string; secret: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== again) return setError("Las contraseñas no coinciden");
    try {
      const r = await api("/auth/accept-invite", { body: { token, password, ...(name ? { name } : {}) }, noRedirect: true });
      setTotp({ uri: r.otpauth_uri, secret: r.secret });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!token) return <main className="auth"><h1>Invitación</h1><p className="error">El enlace no es válido.</p></main>;
  if (totp)
    return (
      <main className="auth">
        <h1>Configura la verificación en dos pasos</h1>
        <TotpSetup uri={totp.uri} secret={totp.secret} />
        <p>Cuando la tengas lista, ingresa: te pediremos el primer código para activar tu cuenta.</p>
        <Link className="btn primary" href="/admin/login">Ir a ingresar</Link>
      </main>
    );
  return (
    <main className="auth">
      <h1>Bienvenida al panel</h1>
      <p>Define tu contraseña (mínimo 12 caracteres, con letras y números).</p>
      <form onSubmit={submit}>
        <Field label="Nombre (opcional)"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Contraseña"><input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Repite la contraseña"><input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" style={{ width: "100%" }}>Crear cuenta</button>
      </form>
    </main>
  );
}

export default function InvitePage() {
  return <Suspense><InviteForm /></Suspense>;
}
