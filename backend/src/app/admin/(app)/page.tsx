"use client";
import { Card, Loading, PageHeader, Table, useLoad } from "../_components/ui";
import { cop, pct } from "../_lib/api";
import { useMe } from "./layout";

const REASONS: Record<string, string> = { invalid_signature: "Firma inválida", replayed: "Copia / repetición", owned_by_other: "Tag de otra cuenta", blocked: "Bloqueado", offline_expired: "Sin conexión vencida" };

export default function Dashboard() {
  const { can } = useMe();
  const { data: d, error, loading } = useLoad<any>(can("dashboard.view") ? "/dashboard" : null);
  if (!can("dashboard.view")) return <><PageHeader title="Inicio" /><p>Bienvenida. Usa el menú para acceder a tus pantallas.</p></>;
  return (
    <>
      <PageHeader title="Inicio" />
      <Loading error={error} loading={loading} />
      {d && (
        <>
          <div className="grid">
            <Kpi label="Clientas activas" v={d.active_users} />
            <Kpi label="Tratamientos en curso" v={d.active_treatments} />
            <Kpi label="Adherencia (30 días)" v={pct(d.adherence_30d)} />
            <Kpi label="Puntos emitidos (30 días)" v={d.points_issued_30d} />
            <Kpi label="Puntos redimidos (30 días)" v={d.points_redeemed_30d} />
            <Kpi label="Puntos en circulación" v={`${d.points_outstanding} (${cop(d.points_outstanding_cop)})`} />
          </div>
          <div className="grid" style={{ marginTop: 16 }}>
            <Kpi label="Lecturas rechazadas (7 días)" v={d.rejected_scans_7d} />
            <Kpi label="Canjes con problemas" v={d.redemption_problems} />
            <Kpi label="Ajustes por aprobar" v={d.pending_adjustments} />
          </div>
          <Card title="Alertas de fraude (7 días)">
            <Table rows={d.rejected_by_reason} cols={[{ header: "Motivo", cell: (r: any) => REASONS[r.reason] ?? r.reason }, { header: "Lecturas", cell: (r: any) => r.n, align: "right" }]} empty="Sin alertas" />
          </Card>
        </>
      )}
    </>
  );
}

const Kpi = ({ label, v }: { label: string; v: React.ReactNode }) => <div className="kpi"><span>{label}</span><b>{v ?? "—"}</b></div>;
