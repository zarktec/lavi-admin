"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Btn, Card, Loading, PageHeader, Pagination, Table, useAction, useLoad } from "../../_components/ui";
import { api, fmtDate } from "../../_lib/api";
import { useMe } from "../layout";

const STATUS_LABEL: Record<string, string> = { "": "Todas", active: "Activas", blocked: "Bloqueadas", deleted: "Eliminadas" };

export default function CustomersPage() {
  const { can } = useMe();
  const [input, setInput] = useState("");
  const [q, setQ] = useState(""); // búsqueda aplicada
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (q) qs.set("q", q);
  if (status) qs.set("status", status);
  const { data, error, loading } = useLoad<any>(can("customers.view") ? `/customers?${qs}` : null);

  // El backend corrige la página si se pasó del final (p. ej. al cambiar el filtro).
  const shown = data?.page ?? page;
  const apply = (nextQ: string, nextStatus: string) => { setQ(nextQ); setStatus(nextStatus); setPage(1); };

  return (
    <>
      <PageHeader title="Clientas" />
      {can("points.approve") && <Pending />}
      {can("customers.view") && (
        <Card>
          <form className="row" onSubmit={(e) => { e.preventDefault(); apply(input.trim(), status); }}>
            <input className="inline-input" style={{ maxWidth: 420 }} aria-label="Buscar clienta" placeholder="Correo, teléfono, nombre o UID de tag" value={input} onChange={(e) => setInput(e.target.value)} />
            <select className="inline-input" style={{ width: "auto" }} aria-label="Estado" value={status} onChange={(e) => apply(q, e.target.value)}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="btn primary" disabled={loading || (input.trim().length > 0 && input.trim().length < 3)}>Buscar</button>
            {(q || status) && <Btn onClick={() => { setInput(""); apply("", ""); }}>Quitar filtros</Btn>}
          </form>
          <Loading error={error} loading={loading && !data} />
          {data && (
            <>
              <Table rows={data.customers} empty={q || status ? "Sin resultados con esos filtros" : "Aún no hay clientas"} cols={[
                { header: "Nombre", cell: (c: any) => <Link href={`/admin/customers/${c.id}`}>{c.name ?? "—"}</Link> },
                { header: "Correo", cell: (c: any) => c.email ?? "—" },
                { header: "Teléfono", cell: (c: any) => c.phone ?? "—" },
                { header: "Saldo", cell: (c: any) => c.balance, align: "right" },
                { header: "Tratamientos activos", cell: (c: any) => c.active_treatments, align: "right" },
                { header: "Estado", cell: (c: any) => <Badge value={c.status} /> },
                { header: "Alta", cell: (c: any) => fmtDate(c.created_at) },
              ]} />
              <Pagination page={shown} pageSize={data.page_size} total={data.total} totalPages={data.total_pages} noun="clientas" disabled={loading}
                onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
            </>
          )}
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
