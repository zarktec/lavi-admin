"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Btn, Card, Loading, PageHeader, Pagination, Table, useLoad } from "../../../../_components/ui";
import { fmtDate } from "../../../../_lib/api";

const STATUS_LABEL: Record<string, string> = { "": "Todos", unclaimed: "Sin reclamar", claimed: "Reclamados", blocked: "Bloqueados" };

/** Tags de un lote, con búsqueda por UID, filtro por estado y paginación. Cada fila abre el detalle del tag. */
export default function BatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (q) qs.set("q", q);
  if (status) qs.set("status", status);
  const { data, error, loading } = useLoad<any>(`/tag-batches/${id}/tags?${qs}`);
  const b = data?.batch;
  const apply = (nextQ: string, nextStatus: string) => { setQ(nextQ); setStatus(nextStatus); setPage(1); };

  return (
    <>
      <PageHeader title={b ? `Lote ${b.batch_code}` : "Lote"} subtitle={b ? `${b.product_name} · ${b.variant_name}` : undefined} crumbs={[{ label: "Tags y lotes", href: "/admin/tags" }, { label: b?.batch_code ?? "Lote" }]} />
      <Loading error={error} loading={loading && !data} />
      {b && (
        <Card>
          <dl className="facts" style={{ margin: 0, padding: 0, border: 0 }}>
            <div><dt>Estado</dt><dd><Badge value={b.status} /></dd></div>
            <div><dt>Importado</dt><dd style={{ fontSize: 15 }}>{fmtDate(b.imported_at)}</dd></div>
            <div><dt>Tags en el lote</dt><dd>{b.tags_total}</dd></div>
            <div><dt>Reclamados</dt><dd>{b.tags_claimed}</dd></div>
            <div><dt>Bloqueados</dt><dd className={b.tags_blocked ? "neg" : ""}>{b.tags_blocked}</dd></div>
          </dl>
        </Card>
      )}
      {data && (
        <Card title="Tags del lote">
          <form className="row" onSubmit={(e) => { e.preventDefault(); apply(input.trim().toUpperCase(), status); }}>
            <input className="inline-input" style={{ maxWidth: 320 }} aria-label="Buscar por UID" placeholder="UID del tag (mín. 3 caracteres)" value={input} onChange={(e) => setInput(e.target.value)} />
            <select className="inline-input" style={{ width: "auto" }} aria-label="Estado" value={status} onChange={(e) => apply(q, e.target.value)}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="btn primary" disabled={loading || (input.trim().length > 0 && input.trim().length < 3)}>Buscar</button>
            {(q || status) && <Btn onClick={() => { setInput(""); apply("", ""); }}>Quitar filtros</Btn>}
          </form>
          <Table rows={data.tags} empty={q || status ? "Sin resultados con esos filtros" : "Este lote no tiene tags"} onRow={(t: any) => router.push(`/admin/tags/${t.uid}`)} cols={[
            { header: "UID", cell: (t: any) => <Link href={`/admin/tags/${t.uid}`} onClick={(e) => e.stopPropagation()}>{t.uid}</Link> },
            { header: "Estado", cell: (t: any) => <Badge value={t.status} /> },
            { header: "Clienta", cell: (t: any) => (t.user_id ? <Link href={`/admin/customers/${t.user_id}`} onClick={(e) => e.stopPropagation()}>{t.user_email ?? t.user_name ?? t.user_id}</Link> : "—") },
            { header: "Reclamado", cell: (t: any) => fmtDate(t.claimed_at) },
            { header: "Contador", cell: (t: any) => (t.last_counter < 0 ? "—" : t.last_counter), align: "right" },
          ]} />
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} totalPages={data.total_pages} noun="tags" disabled={loading}
            onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        </Card>
      )}
    </>
  );
}
