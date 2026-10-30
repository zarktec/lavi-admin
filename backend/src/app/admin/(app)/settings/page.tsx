"use client";
import { useEffect, useState } from "react";
import { Card, Field, Loading, PageHeader, useAction, useLoad } from "../../_components/ui";
import { api } from "../../_lib/api";
import { useMe } from "../layout";

type Kind = "num" | "bool" | "text";
type FieldSec = "puntos" | "lecturas" | "app";
const FIELDS: { key: string; label: string; kind: Kind; hint?: string; sec: "puntos" | "lecturas" | "app" }[] = [
  { key: "point_value_cop", label: "Valor de un punto (COP)", kind: "num", sec: "puntos" },
  { key: "points_expiration_days", label: "Vigencia de los puntos (días)", kind: "num", hint: "0 = no vencen", sec: "puntos" },
  { key: "min_points_to_redeem", label: "Mínimo de puntos para redimir", kind: "num", sec: "puntos" },
  { key: "allow_negative_balance", label: "El saldo puede bajar de cero", kind: "bool", sec: "puntos" },
  { key: "allow_parallel_treatments", label: "Permitir varios tratamientos activos a la vez", kind: "bool", sec: "lecturas" },
  { key: "offline_scan_max_hours", label: "Plazo para enviar una lectura sin conexión (horas)", kind: "num", sec: "lecturas" },
  { key: "offline_device_time_tolerance_minutes", label: "Tolerancia de la hora del dispositivo (minutos)", kind: "num", sec: "lecturas" },
  { key: "redemption_code_valid_days", label: "Vigencia de los códigos de canje (días)", kind: "num", sec: "puntos" },
  { key: "refund_points_on_expired_code", label: "Devolver puntos si el código vence sin usarse", kind: "bool", sec: "puntos" },
  { key: "manual_adjustment_approval_threshold", label: "Monto de ajuste manual que requiere aprobación", kind: "num", hint: "Por encima de este valor, un superadministrador debe aprobar", sec: "app" },
  { key: "min_app_version", label: "Versión mínima obligatoria de la app", kind: "text", hint: "Ej. 1.2.0 — versiones anteriores deben actualizar", sec: "app" },
  { key: "activation_token_minutes", label: "Vigencia del token de activación (minutos)", kind: "num", sec: "app" },
];
const SECTIONS: [FieldSec, string, string][] = [
  ["puntos", "Puntos y canjes", "Cuánto vale un punto, cuándo vencen y qué se necesita para canjear."],
  ["lecturas", "Tratamientos y lecturas", "Reglas para registrar dosis, incluidas las lecturas hechas sin conexión."],
  ["app", "Aprobaciones y app móvil", "Umbral para aprobar ajustes manuales y requisitos de la app."],
];
const TEXTS: [string, string, string?][] = [
  ["reminder_title", "Recordatorio: título"], ["reminder_body", "Recordatorio: mensaje", "Puedes usar {product}"], ["nudge_body", "Insistencia del recordatorio", "Puedes usar {product}"],
  ["backup_title", "Push de respaldo: título"], ["backup_body", "Push de respaldo: mensaje"], ["repurchase_title", "Recompra: título"], ["repurchase_body", "Recompra: mensaje", "Puedes usar {product}"],
];

export default function SettingsPage() {
  const { can } = useMe();
  const canEdit = can("settings.manage");
  const { data, error, loading, reload } = useLoad<any>("/settings");
  const [s, setS] = useState<any>({});
  const { run, busy } = useAction();
  useEffect(() => { if (data) setS(JSON.parse(JSON.stringify(data.settings))); }, [data]);
  const set = (k: string, v: any) => setS((x: any) => ({ ...x, [k]: v }));
  const dirty = !!data && JSON.stringify(s) !== JSON.stringify(data.settings);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body: any = {};
    for (const f of FIELDS) {
      const v = s[f.key];
      if (v === undefined || v === "") continue;
      body[f.key] = f.kind === "num" ? Number(v) : v;
    }
    if (s.notification_texts && TEXTS.every(([k]) => s.notification_texts[k])) body.notification_texts = s.notification_texts;
    if (await run(() => api("/settings", { method: "PUT", body }), "Ajustes guardados")) reload();
  }

  return (
    <>
      <PageHeader title="Ajustes globales" subtitle="Reglas del programa de puntos y textos de las notificaciones." />
      <Loading error={error} loading={loading} />
      {data && (
        <form onSubmit={save}>
          {!data.complete && <div className="notice" role="alert">Faltan ajustes obligatorios. Completa todos los campos antes del lanzamiento: ningún valor de negocio vive en el código.</div>}
          {SECTIONS.map(([sec, title, desc]) => (
            <Card key={sec} title={title} description={desc}>
              <div className="form-grid">
                {FIELDS.filter((f) => f.sec === sec && f.kind !== "bool").map((f) => (
                  <Field key={f.key} label={f.label} hint={f.hint}><input disabled={!canEdit} type={f.kind === "num" ? "number" : "text"} step="any" min={f.kind === "num" ? 0 : undefined} value={s[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} /></Field>
                ))}
              </div>
              {FIELDS.filter((f) => f.sec === sec && f.kind === "bool").map((f) => (
                <label key={f.key} className="check"><input type="checkbox" disabled={!canEdit} checked={!!s[f.key]} onChange={(e) => set(f.key, e.target.checked)} /> {f.label}</label>
              ))}
            </Card>
          ))}
          <Card title="Textos de notificaciones" description="Los textos que ve la clienta en sus recordatorios. Usa {product} para insertar el nombre del producto.">
            <div className="form-grid">
              {TEXTS.map(([k, label, hint]) => (
                <Field key={k} label={label} hint={hint}><textarea rows={2} disabled={!canEdit} value={s.notification_texts?.[k] ?? ""} onChange={(e) => set("notification_texts", { ...(s.notification_texts ?? {}), [k]: e.target.value })} /></Field>
              ))}
            </div>
          </Card>
          {canEdit && (
            <div className="savebar" role="region" aria-label="Guardar cambios">
              <div className="dirty" aria-live="polite">{dirty ? <><i /> Tienes cambios sin guardar</> : "Todo guardado"}</div>
              <div className="row">
                {dirty && <button type="button" className="btn" onClick={() => setS(JSON.parse(JSON.stringify(data.settings)))}>Descartar</button>}
                <button className="btn primary" disabled={busy || !dirty} aria-busy={busy || undefined}>Guardar ajustes</button>
              </div>
            </div>
          )}
        </form>
      )}
    </>
  );
}
