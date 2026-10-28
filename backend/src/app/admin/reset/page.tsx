"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Field } from "../_components/ui";
import { api } from "../_lib/api";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== again) return setError("Las contraseñas no coinciden");
    try {
      await api("/auth/reset", { body: { token, password }, noRedirect: true });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <main className="auth">
      <h1>Nueva contraseña</h1>
      {done ? (
        <p>Listo. Ya puedes <Link href="/admin/login">ingresar</Link> con tu nueva contraseña (y tu verificación en dos pasos).</p>
      ) : (
        <form onSubmit={submit}>
          <Field label="Contraseña" hint="Mínimo 12 caracteres, con letras y números"><input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Repite la contraseña"><input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" style={{ width: "100%" }}>Guardar</button>
        </form>
      )}
    </main>
  );
}

export default function ResetPage() {
  return <Suspense><ResetForm /></Suspense>;
}
