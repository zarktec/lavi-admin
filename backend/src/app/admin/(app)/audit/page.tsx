"use client";
import { useEffect, useState } from "react";
import { Btn, Card, Field, Json, PageHeader, Table, useAction } from "../../_components/ui";
import { api, fmtDate } from "../../_lib/api";

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const { run, busy } = useAction();

  async function load(before?: number, reset = false) {
    const qs = new URLSearchParams({ limit: "50" });
    if (action) qs.set("action", action);
    if (entity) qs.set("entity", entity);
    if (before) qs.set("before", String(before));
    const r = await run(() => api(`/audit?${qs}`));
    if (r) { setRows(reset ? r.entries : [...rows, ...r.entries]); setNext(r.next_before); }
  }
  useEffect(() => { load(undefined, true); /* eslint-disable-next-line */ }, []);

  return (
    <>
      <PageHeader title="Auditoría" />
      <Card>
        <form className="row" style={{ alignItems: "end" }} onSubmit={(e) => { e.preventDefault(); load(undefined, true); }}>
          <Field label="Acción (prefijo)"><input placeholder="p. ej. points." value={action} onChange={(e) => setAction(e.target.value)} /></Field>
          <Field label="Entidad"><input placeholder="p. ej. tag" value={entity} onChange={(e) => setEntity(e.target.value)} /></Field>
          <div style={{ marginBottom: 12 }}><button className="btn primary" disabled={busy}>Filtrar</button></div>
        </form>
        <Table rows={rows} empty="Sin registros" onRow={(r) => setOpen(open === r.id ? null : r.id)} cols={[
          { header: "Fecha", cell: (r: any) => fmtDate(r.created_at) },
          { header: "Quién", cell: (r: any) => r.admin_email ?? "sistema" },
          { header: "Acción", cell: (r: any) => r.action },
          { header: "Entidad", cell: (r: any) => <>{r.entity}<br /><span className="muted">{r.entity_id}</span></> },
          { header: "Anterior → nuevo", cell: (r: any) => open === r.id ? <div className="row" style={{ alignItems: "flex-start" }}><Json v={r.before} /><span>→</span><Json v={r.after} /></div> : <span className="muted">clic para ver</span> },
        ]} />
        {next && <div className="row end"><Btn disabled={busy} onClick={() => load(next)}>Cargar más</Btn></div>}
      </Card>
    </>
  );
}
