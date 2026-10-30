"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Btn, Card, Field, Loading, Modal, PageHeader, Table, Tabs, useAction, useLoad } from "../../../_components/ui";
import { api, fmtDate, fmtDay } from "../../../_lib/api";
import { useMe } from "../../layout";

const RESULT: Record<string, string> = { activation_required: "Activación", dose_recorded: "Dosis a tiempo", too_early: "Muy temprano", late: "Tarde", no_pending_dose: "Sin dosis pendiente", treatment_finished: "Terminado", rejected: "Rechazada" };

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useMe();
  const { data, error, loading, reload } = useLoad<any>(`/customers/${id}`);
  const [tab, setTab] = useState("treatments");
  const [adjust, setAdjust] = useState(false);
  const u = data?.user;
  return (
    <>
      <PageHeader title={u ? `${u.name ?? "Clienta"} · ${u.email ?? ""}` : "Clienta"}>
        <Link className="btn" href="/admin/customers">← Volver</Link>
        {can("points.adjust") && u && <Btn kind="primary" onClick={() => setAdjust(true)}>Ajuste manual de puntos</Btn>}
      </PageHeader>
      <Loading error={error} loading={loading} />
      {data && (
        <>
          <Card>
            <div className="form-grid">
              <p><b>Estado:</b> <Badge value={u.status} /></p>
              <p><b>Teléfono:</b> {u.phone ?? "—"}</p>
              <p><b>Zona horaria:</b> {u.timezone}</p>
              <p><b>Alta:</b> {fmtDate(u.created_at)}</p>
              <p><b>Autorización de datos:</b> {fmtDate(u.data_consent_at)}</p>
              <p><b>Saldo de puntos:</b> {data.balance}</p>
              <p><b>Tags:</b> {data.tags.map((t: any) => <span key={t.uid}><Link href={`/admin/tags/${t.uid}`}>{t.uid}</Link> <Badge value={t.status} /> </span>)}</p>
            </div>
          </Card>
          <Tabs value={tab} onChange={setTab} tabs={[["treatments", "Calendario de dosis"], ["scans", "Lecturas"], ["changes", "Cambios de horario"], ["ledger", "Puntos"], ["redemptions", "Canjes"], ["adjustments", "Ajustes"]]} />
          {tab === "treatments" && (data.treatments.length ? data.treatments.map((t: any) => (
            <Card key={t.id} title={`${t.product_name} · ${t.variant_name} (config v${t.config_version})`} actions={<Badge value={t.status} />}>
              <p className="muted">Tag {t.tag_uid} · {fmtDay(t.start_date)} a {fmtDay(t.end_date)} · horarios {t.reminder_times.join(", ")} · {t.points_earned} puntos ganados</p>
              <div className="doses">{t.doses.map((d: any) => <span key={d.id} className={`dose ${d.status}`} title={`${fmtDate(d.window_start)} – ${fmtDate(d.window_end)} · ${d.status}`}>{new Date(d.window_start).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" })}</span>)}</div>
              <p className="muted">Verde: a tiempo · Amarillo: tarde · Rojo: perdida · Gris: programada</p>
            </Card>
          )) : <p className="muted">Sin tratamientos.</p>)}
          {tab === "scans" && <Card><Table rows={data.scans} cols={[
            { header: "Fecha", cell: (s: any) => fmtDate(s.server_time) },
            { header: "Tag", cell: (s: any) => s.tag_uid ?? "—" },
            { header: "Contador", cell: (s: any) => s.counter ?? "—" },
            { header: "Resultado", cell: (s: any) => <>{RESULT[s.result] ?? s.result}{s.reason && <span className="muted"> · {s.reason}</span>}</> },
            { header: "Sin conexión", cell: (s: any) => (s.offline ? `sí (${fmtDate(s.device_time)})` : "no") },
          ]} /></Card>}
          {tab === "changes" && <Card><Table rows={data.schedule_changes} empty="Sin cambios de horario" cols={[
            { header: "Fecha", cell: (c: any) => fmtDate(c.created_at) },
            { header: "Antes", cell: (c: any) => c.old_times.join(", ") },
            { header: "Después", cell: (c: any) => c.new_times.join(", ") },
            { header: "Rige desde", cell: (c: any) => fmtDate(c.effective_from) },
          ]} /></Card>}
          {tab === "ledger" && <Card><Table rows={data.ledger} empty="Sin movimientos" cols={[
            { header: "Fecha", cell: (l: any) => fmtDate(l.created_at) },
            { header: "Puntos", cell: (l: any) => (l.amount > 0 ? `+${l.amount}` : l.amount), align: "right" },
            { header: "Motivo", cell: (l: any) => l.reason },
            { header: "Nota", cell: (l: any) => l.note ?? "" },
            { header: "Vence", cell: (l: any) => fmtDay(l.expires_at) },
          ]} /></Card>}
          {tab === "redemptions" && <Card><Table rows={data.redemptions} empty="Sin canjes" cols={[
            { header: "Fecha", cell: (r: any) => fmtDate(r.created_at) },
            { header: "Opción", cell: (r: any) => r.option_name },
            { header: "Puntos", cell: (r: any) => r.points, align: "right" },
            { header: "Código", cell: (r: any) => r.code },
            { header: "Estado", cell: (r: any) => <Badge value={r.status} /> },
            { header: "Vence", cell: (r: any) => fmtDay(r.expires_at) },
          ]} /></Card>}
          {tab === "adjustments" && <Card><Table rows={data.adjustments} empty="Sin ajustes manuales" cols={[
            { header: "Fecha", cell: (a: any) => fmtDate(a.created_at) },
            { header: "Puntos", cell: (a: any) => (a.amount > 0 ? `+${a.amount}` : a.amount), align: "right" },
            { header: "Motivo", cell: (a: any) => a.reason },
            { header: "Estado", cell: (a: any) => <Badge value={a.status} /> },
          ]} /></Card>}
        </>
      )}
      {adjust && <AdjustModal userId={id} onClose={() => setAdjust(false)} onDone={() => { setAdjust(false); reload(); }} />}
    </>
  );
}

function AdjustModal({ userId, onClose, onDone }: { userId: string; onClose: () => void; onDone: () => void }) {
  const { me } = useMe();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const { run, busy } = useAction();
  const n = Number(amount);
  return (
    <Modal title="Ajuste manual de puntos" onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(() => api(`/customers/${userId}/adjustments`, { body: { amount: n, reason: reason.trim() } }));
        if (r) { alert(r.status === "pending_approval" ? "El ajuste superó el umbral y quedó pendiente de aprobación de un superadministrador." : "Ajuste aplicado."); onDone(); }
      }}>
        <Field label="Puntos (positivo suma, negativo resta)" hint={me.admin.max_adjustment ? `Tu rol permite hasta ${me.admin.max_adjustment} puntos por movimiento` : undefined}>
          <input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Motivo (obligatorio)"><textarea required minLength={5} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="row end"><Btn onClick={onClose}>Cancelar</Btn><button className="btn primary" disabled={busy || !n || reason.trim().length < 5}>Registrar</button></div>
      </form>
    </Modal>
  );
}
