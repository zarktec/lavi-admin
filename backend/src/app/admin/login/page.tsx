"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { TotpSetup } from "../_components/TotpSetup";
import { Field, AuthShell } from "../_components/ui";
import { api } from "../_lib/api";
import { useSearchParams } from "next/navigation";

type Step = { kind: "credentials" } | { kind: "code"; setup?: { uri: string; secret: string } };

function LoginForm() {
  const router = useRouter();
  const reason = useSearchParams().get("reason");
  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api("/auth/login", { body: { email, password }, noRedirect: true });
      setStep({ kind: "code", setup: r.mfa === "setup" ? { uri: r.otpauth_uri, secret: r.secret } : undefined });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/auth/mfa", { body: { code }, noRedirect: true });
      router.push("/admin");
    } catch (err) {
      setError((err as Error).message);
      setCode("");
    }
  }

  return (
    <AuthShell>
      <h1>Bienvenida de vuelta</h1>
      {reason === "expired" && <div className="notice" role="alert">Tu sesión venció por inactividad. Vuelve a ingresar.</div>}
      {step.kind === "credentials" ? (
        <form onSubmit={submitCredentials}>
          <p>Ingresa con tu cuenta del panel.</p>
          <Field label="Correo"><input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Contraseña">
            <span className="pw">
              <input type={showPw ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="btn link sm" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}>{showPw ? "Ocultar" : "Mostrar"}</button>
            </span>
          </Field>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" style={{ width: "100%" }} disabled={busy} aria-busy={busy || undefined}>Continuar</button>
          <p><Link href="/admin/forgot">Olvidé mi contraseña</Link></p>
        </form>
      ) : (
        <form onSubmit={submitCode}>
          {step.setup ? (
            <>
              <p><b>Primer ingreso:</b> configura la verificación en dos pasos.</p>
              <TotpSetup uri={step.setup.uri} secret={step.setup.secret} />
            </>
          ) : (
            <p>Escribe el código de 6 dígitos de tu app autenticadora.</p>
          )}
          <Field label="Código de verificación"><input inputMode="numeric" autoComplete="one-time-code" pattern="\s*\d{3}\s?\d{3}\s*" maxLength={7} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" style={{ width: "100%" }}>Verificar e ingresar</button>
        </form>
      )}
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
