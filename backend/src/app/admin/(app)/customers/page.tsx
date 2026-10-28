"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Btn, Card, Loading, PageHeader, Table, useAction, useLoad } from "../../_components/ui";
import { api, fmtDate } from "../../_lib/api";
import { useMe } from "../layout";

export default function CustomersPage() {
  const { can } = useMe();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const { run, busy } = useAction();
  return (
    <>
      <PageHeader title="Clientas" />
      {can("points.approve") && <Pending />}
      {can("customers.view") && (
        <Card>
          <form className="row" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api(`/customers?q=${encodeURIComponent(q.trim())}`)); if (r) setRows(r.customers); }}>
            <input className="inline-input" style={{ maxWidth: 420 }} aria-label="Buscar clienta" placeholder="Correo, teléfono, nombre o UID de tag" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn primary" disabled={busy || q.trim().length < 3}>Buscar</button>
          </form>
          {rows && <Table rows={rows} empty="Sin resultados" cols={[
            { header: "Nombre", cell: (c: any) => <Link href={`/admin/customers/${c.id}`}>{c.name ?? "—"}</Link> },
            { header: "Correo", cell: (c: any) => c.email ?? "—" },
            { header: "Teléfono", cell: (c: any) => c.phone ?? "—" },
            { header: "Saldo", cell: (c: any) => c.balance, align: "right" },
            { header: "Tratamientos activos", cell: (c: any) => c.active_treatments, align: "right" },
            { header: "Estado", cell: (c: any) => <Badge value={c.status} /> },
            { header: "Alta", cell: (c: any) => fmtDate(c.created_at) },
          ]} />}
        </Card>
      )}
    </>
  );
}

function Pending() {
  const { data, error, loading, reload } = useLoad<any>("/adjustments");
  const { run, busy } = useAction();
  const decide = async (id: string, approve: boolean) => { if (await run(() => api(`/adjustments/${id}/decision`, { body: { approve } }), approve ? "Ajuste aprobado" : "Ajuste rechazado")) reload(); };
  return (
    <Card title="Ajustes manuales por aprobar">
      <Loading error={error} loading={loading} />
      {data && <Table rows={data.adjustments} empty="No hay ajustes pendientes" cols={[
        { header: "Clienta", cell: (a: any) => <Link href={`/admin/customers/${a.user_id}`}>{a.user_email}</Link> },
        { header: "Puntos", cell: (a: any) => (a.amount > 0 ? `+${a.amount}` : a.amount), align: "right" },
        { header: "Motivo", cell: (a: any) => a.reason },
        { header: "Pidió", cell: (a: any) => a.requested_by_email },
        { header: "Fecha", cell: (a: any) => fmtDate(a.created_at) },
        { header: "", cell: (a: any) => <div className="row"><Btn className="sm" kind="primary" disabled={busy} onClick={() => decide(a.id, true)}>Aprobar</Btn><Btn className="sm" disabled={busy} onClick={() => decide(a.id, false)}>Rechazar</Btn></div> },
      ]} />}
    </Card>
  );
}
