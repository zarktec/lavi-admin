"use client";
import Link from "next/link";
import { useState } from "react";
import { Field } from "../_components/ui";
import { api } from "../_lib/api";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/auth/forgot", { body: { email }, noRedirect: true });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <main className="auth">
      <h1>Recuperar acceso</h1>
      {sent ? (
        <p>Si el correo existe, te enviamos un enlace para definir una nueva contraseña. Vence en 1 hora.</p>
      ) : (
        <form onSubmit={submit}>
          <Field label="Correo"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" style={{ width: "100%" }}>Enviar enlace</button>
        </form>
      )}
      <p><Link href="/admin/login">Volver a ingresar</Link></p>
    </main>
  );
}
