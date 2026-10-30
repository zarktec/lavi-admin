"use client";
import { Bar, Card, Loading, PageHeader, Stat, Table, useLoad } from "../_components/ui";
import { cop, num, pct } from "../_lib/api";
import { useMe } from "./layout";

const REASONS: Record<string, string> = { invalid_signature: "Firma inválida", replayed: "Copia / repetición", owned_by_other: "Tag de otra cuenta", blocked: "Tag bloqueado", offline_expired: "Lectura sin conexión vencida" };

export default function Dashboard() {
  const { can, me } = useMe();
  const { data: d, error, loading } = useLoad<any>(can("dashboard.view") ? "/dashboard" : null);
  const first = me.admin.name.split(" ")[0];
  if (!can("dashboard.view")) return <><PageHeader title={`Hola, ${first}`} subtitle="Usa el menú para ir a tus pantallas." /></>;

  const pending = d ? d.pending_adjustments + d.redemption_problems + d.rejected_scans_7d : 0;
  const totalRejected = d ? d.rejected_by_reason.reduce((a: number, r: any) => a + r.n, 0) : 0;
  return (
    <>
      <PageHeader title={`Hola, ${first}`} subtitle={d ? (pending === 0 ? "Todo en orden: no hay pendientes que atender." : "Esto es lo que necesita tu atención hoy.") : "Resumen del programa de adherencia."} />
      <Loading error={error} loading={loading} />
      {d && (
        <>
          <h2 className="section-title">Requiere tu atención</h2>
          <div className="attention">
            <Stat href="/admin/customers" icon="users" label="Ajustes de puntos por aprobar" value={num(d.pending_adjustments)} tone={d.pending_adjustments ? "warn" : "ok"} hint={d.pending_adjustments ? "Revisar y decidir" : "Nada pendiente"} />
            <Stat href="/admin/points" icon="gift" label="Canjes con problemas" value={num(d.redemption_problems)} tone={d.redemption_problems ? "bad" : "ok"} hint={d.redemption_problems ? "Reintentar o revertir" : "Todos los canjes al día"} />
            <Stat href="/admin/reports" icon="radar" label="Lecturas rechazadas (7 días)" value={num(d.rejected_scans_7d)} tone={d.rejected_scans_7d ? "warn" : "ok"} hint={d.rejected_scans_7d ? "Posible fraude o tags mal programados" : "Sin rechazos"} />
          </div>

          <h2 className="section-title">Programa</h2>
          <div className="grid">
            <Stat icon="users" label="Clientas activas" value={num(d.active_users)} hint="Con un tratamiento en curso" />
            <Stat icon="package" label="Tratamientos en curso" value={num(d.active_treatments)} />
            <div className="stat">
              <div className="label">Adherencia (30 días)</div>
              <div className="value">{pct(d.adherence_30d)}</div>
              <Bar value={d.adherence_30d ?? 0} tone={d.adherence_30d == null ? undefined : d.adherence_30d >= 0.8 ? "ok" : d.adherence_30d >= 0.6 ? "warn" : "bad"} label="Adherencia a 30 días" />
              <div className="hint">Dosis a tiempo sobre dosis resueltas</div>
            </div>
          </div>

          <h2 className="section-title">Puntos</h2>
          <div className="grid">
            <Stat icon="star" label="Emitidos (30 días)" value={num(d.points_issued_30d)} />
            <Stat icon="gift" label="Redimidos (30 días)" value={num(d.points_redeemed_30d)} />
            <Stat icon="star" label="En circulación" value={num(d.points_outstanding)} hint={`Pasivo estimado: ${cop(d.points_outstanding_cop)}`} />
          </div>

          <Card title="Lecturas rechazadas por motivo" description="Últimos 7 días. Un motivo que crece de golpe suele indicar un problema con los tags o un intento de fraude.">
            {d.rejected_by_reason.length === 0 ? (
              <Table rows={[]} cols={[]} empty="Sin lecturas rechazadas" />
            ) : (
              <div>
                {d.rejected_by_reason.map((r: any) => (
                  <div className="hbar" key={r.reason}>
                    <span>{REASONS[r.reason] ?? r.reason}</span>
                    <Bar value={totalRejected ? r.n / totalRejected : 0} tone="warn" label={REASONS[r.reason] ?? r.reason} />
                    <b className="num right">{num(r.n)}</b>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
