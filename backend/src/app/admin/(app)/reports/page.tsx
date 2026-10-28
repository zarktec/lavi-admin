"use client";
import { useState } from "react";
import { Card, Field, Loading, PageHeader, Table, Tabs, useLoad } from "../../_components/ui";
import { cop, fmtDate, pct } from "../../_lib/api";

const REASONS: Record<string, string> = { invalid_signature: "Firma inválida", replayed: "Copia / repetición", owned_by_other: "Tag de otra cuenta", blocked: "Bloqueado", offline_expired: "Sin conexión vencida" };

export default function ReportsPage() {
  const [tab, setTab] = useState("adherence");
  return (
    <>
      <PageHeader title="Reportes" />
      <Tabs value={tab} onChange={setTab} tabs={[["adherence", "Adherencia"], ["retention", "Retención"], ["repurchase", "Recompra"], ["liability", "Pasivo de puntos"], ["fraud", "Fraude"]]} />
      {tab === "adherence" && <Adherence />}
      {tab === "retention" && <Retention />}
      {tab === "repurchase" && <Repurchase />}
      {tab === "liability" && <Liability />}
      {tab === "fraud" && <Fraud />}
    </>
  );
}

function Adherence() {
  const { data, error, loading } = useLoad<any>("/reports/adherence");
  return <Card title="Adherencia por presentación y versión de configuración"><Loading error={error} loading={loading} />
    {data && <Table rows={data.rows} empty="Aún no hay dosis resueltas" cols={[
      { header: "Producto", cell: (r: any) => r.product_name }, { header: "Presentación", cell: (r: any) => r.variant_name }, { header: "Versión", cell: (r: any) => `v${r.config_version}` },
      { header: "Dosis", cell: (r: any) => r.doses, align: "right" }, { header: "A tiempo", cell: (r: any) => r.on_time, align: "right" }, { header: "Tarde", cell: (r: any) => r.late, align: "right" }, { header: "Perdidas", cell: (r: any) => r.missed, align: "right" },
      { header: "Adherencia", cell: (r: any) => <b>{pct(r.adherence_rate)}</b>, align: "right" },
    ]} />}</Card>;
}

function Retention() {
  const { data, error, loading } = useLoad<any>("/reports/retention");
  return <Card title="Retención por cohorte mensual"><p className="muted">Porcentaje de tratamientos que siguen registrando dosis pasadas 2, 4 y 8 semanas de la activación (solo cohortes con antigüedad suficiente).</p><Loading error={error} loading={loading} />
    {data && <Table rows={data.cohorts} empty="Sin datos" cols={[
      { header: "Cohorte", cell: (r: any) => r.cohort }, { header: "Tratamientos", cell: (r: any) => r.size, align: "right" },
      { header: "2 semanas", cell: (r: any) => pct(r.w2), align: "right" }, { header: "4 semanas", cell: (r: any) => pct(r.w4), align: "right" }, { header: "8 semanas", cell: (r: any) => pct(r.w8), align: "right" },
    ]} />}</Card>;
}

function Repurchase() {
  const [t, setT] = useState("0.8");
  const { data, error, loading } = useLoad<any>(`/reports/repurchase?threshold=${t}`);
  return <Card title="Recompra: completan vs. abandonan">
    <Field label="Se considera completo si registró al menos…" hint="Fracción de dosis a tiempo o tardías (0.1 a 1)"><input type="number" step="0.05" min="0.1" max="1" value={t} onChange={(e) => setT(e.target.value)} style={{ maxWidth: 140 }} /></Field>
    <Loading error={error} loading={loading} />
    {data && <Table rows={[{ g: "Completaron el tratamiento", ...data.completed }, { g: "Lo abandonaron", ...data.abandoned }]} cols={[
      { header: "Grupo", cell: (r: any) => r.g }, { header: "Tratamientos", cell: (r: any) => r.treatments, align: "right" }, { header: "Recompraron", cell: (r: any) => r.repurchased, align: "right" }, { header: "Tasa de recompra", cell: (r: any) => <b>{pct(r.rate)}</b>, align: "right" },
    ]} />}</Card>;
}

function Liability() {
  const { data: d, error, loading } = useLoad<any>("/reports/liability");
  return <Card title="Pasivo de puntos"><Loading error={error} loading={loading} />
    {d && <div className="grid">
      <div className="kpi"><span>Puntos vigentes sin redimir</span><b>{d.outstanding_points}</b></div>
      <div className="kpi"><span>Equivalente en pesos</span><b>{cop(d.outstanding_cop)}</b></div>
      <div className="kpi"><span>Clientas con puntos</span><b>{d.users_with_points}</b></div>
      <div className="kpi"><span>Vencen en 30 días</span><b>{d.expiring_30d_points} ({cop(d.expiring_30d_cop)})</b></div>
      <div className="kpi"><span>Valor de un punto</span><b>{cop(d.point_value_cop)}</b></div>
    </div>}</Card>;
}

function Fraud() {
  const { data, error, loading } = useLoad<any>("/reports/fraud");
  return <>
    <Loading error={error} loading={loading} />
    {data && <>
      <Card title="Lecturas rechazadas (30 días)"><Table rows={data.rejected_by_reason} empty="Sin rechazos" cols={[{ header: "Motivo", cell: (r: any) => REASONS[r.reason] ?? r.reason }, { header: "Lecturas", cell: (r: any) => r.scans, align: "right" }, { header: "Clientas", cell: (r: any) => r.users, align: "right" }]} /></Card>
      <Card title="Tags intentados en varias cuentas"><Table rows={data.tags_in_multiple_accounts} empty="Ninguno" cols={[{ header: "Tag", cell: (r: any) => r.tag_uid }, { header: "Cuentas", cell: (r: any) => r.accounts, align: "right" }, { header: "Intentos", cell: (r: any) => r.attempts, align: "right" }, { header: "Último", cell: (r: any) => fmtDate(r.last_attempt) }]} /></Card>
      <Card title="Patrones anómalos de lecturas sin conexión"><Table rows={data.offline_anomalies} empty="Ninguno" cols={[{ header: "Clienta", cell: (r: any) => r.email }, { header: "Lecturas", cell: (r: any) => r.scans, align: "right" }, { header: "Sin conexión", cell: (r: any) => r.offline_scans, align: "right" }]} /></Card>
      <Card title="Reloj del dispositivo desfasado (> 1 h)"><Table rows={data.device_clock_skew} empty="Ninguno" cols={[{ header: "Clienta", cell: (r: any) => r.email }, { header: "Lecturas", cell: (r: any) => r.scans, align: "right" }, { header: "Desfase medio (min)", cell: (r: any) => r.avg_skew_minutes, align: "right" }]} /></Card>
    </>}
  </>;
}
