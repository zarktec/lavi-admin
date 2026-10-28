"use client";
import { useState } from "react";
import { Badge, Btn, Card, Field, Loading, Modal, PageHeader, PromptModal, Table, Tabs, useAction, useLoad } from "../../_components/ui";
import { api, fmtDate } from "../../_lib/api";
import { useMe } from "../layout";

export default function TagsPage() {
  const [tab, setTab] = useState("batches");
  return (
    <>
      <PageHeader title="Tags y lotes" />
      <Tabs tabs={[["batches", "Lotes"], ["search", "Buscar tag"]]} value={tab} onChange={setTab} />
      {tab === "batches" ? <Batches /> : <TagSearch />}
    </>
  );
}

function Batches() {
  const { can } = useMe();
  const { data, error, loading, reload } = useLoad<any>("/tag-batches");
  const [importing, setImporting] = useState(false);
  const [block, setBlock] = useState<{ batch: any; blocked: boolean } | null>(null);
  return (
    <>
      <Card title="Lotes importados" actions={can("tags.manage") && <Btn kind="primary" onClick={() => setImporting(true)}>Importar lote</Btn>}>
        <Loading error={error} loading={loading} />
        {data && <Table rows={data.batches} empty="Aún no hay lotes" cols={[
          { header: "Lote", cell: (b: any) => b.batch_code },
          { header: "Presentación", cell: (b: any) => `${b.product_name} · ${b.variant_name}` },
          { header: "Importado", cell: (b: any) => fmtDate(b.imported_at) },
          { header: "Tags", cell: (b: any) => `${b.tags_total} (${b.tags_claimed} reclamados, ${b.tags_blocked} bloqueados)` },
          { header: "Estado", cell: (b: any) => <Badge value={b.status} /> },
          { header: "", cell: (b: any) => can("tags.manage") && <Btn className="sm" onClick={() => setBlock({ batch: b, blocked: b.status !== "blocked" })}>{b.status === "blocked" ? "Desbloquear" : "Bloquear"}</Btn> },
        ]} />}
      </Card>
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); reload(); }} />}
      {block && <PromptModal danger={block.blocked} title={`${block.blocked ? "Bloquear" : "Desbloquear"} lote ${block.batch.batch_code}`} label="Motivo" confirm={block.blocked ? "Bloquear lote" : "Desbloquear"} onClose={() => setBlock(null)}
        onSubmit={async (reason) => { await api(`/tag-batches/${block.batch.id}/block`, { body: { blocked: block.blocked, reason } }); reload(); }} />}
    </>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { data } = useLoad<any>("/products");
  const variants = (data?.products ?? []).flatMap((p: any) => p.variants.map((v: any) => ({ id: v.id, label: `${p.name} · ${v.name}` })));
  const [variantId, setVariantId] = useState("");
  const [code, setCode] = useState("");
  const [keyRef, setKeyRef] = useState("");
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<any>(null);
  const { run, busy } = useAction();
  return (
    <Modal title="Importar lote del fabricante" onClose={onClose}>
      {result ? (
        <>
          <p><b>Lote {result.batch_code} importado.</b></p>
          <ul><li>Recibidos: {result.received}</li><li>Importados: {result.imported}</li><li>Ya existían: {result.skipped_existing}</li><li>Duplicados en el archivo: {result.duplicates_in_file}</li></ul>
          <div className="row end"><Btn kind="primary" onClick={onDone}>Cerrar</Btn></div>
        </>
      ) : (
        <form onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => api("/tag-batches", { body: { variant_id: variantId, batch_code: code, csv, ...(keyRef ? { key_ref: keyRef } : {}) } }));
          if (r) setResult(r);
        }}>
          <Field label="Presentación"><select required value={variantId} onChange={(e) => setVariantId(e.target.value)}><option value="">Selecciona…</option>{variants.map((v: any) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></Field>
          <div className="form-grid">
            <Field label="Código de lote"><input required value={code} onChange={(e) => setCode(e.target.value)} /></Field>
            <Field label="Referencia de llave (key_ref)" hint="Opcional si hay una sola llave maestra"><input value={keyRef} onChange={(e) => setKeyRef(e.target.value)} placeholder="v1" /></Field>
          </div>
          <Field label="Archivo CSV (uid[,key_ref])"><input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} /></Field>
          <Field label="o pega los UID" hint="Un UID de 14 caracteres hexadecimales por línea"><textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} /></Field>
          <p className="muted">{csv.split(/\r?\n/).filter((l) => l.trim()).length} líneas</p>
          <div className="row end"><Btn onClick={onClose}>Cancelar</Btn><button className="btn primary" disabled={busy || !csv.trim() || !variantId}>Importar</button></div>
        </form>
      )}
    </Modal>
  );
}

const RESULT: Record<string, string> = { activation_required: "Activación", dose_recorded: "Dosis a tiempo", too_early: "Muy temprano", late: "Tarde", no_pending_dose: "Sin dosis pendiente", treatment_finished: "Tratamiento terminado", rejected: "Rechazada" };

function TagSearch() {
  const { can } = useMe();
  const [uid, setUid] = useState("");
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [block, setBlock] = useState<boolean | null>(null);
  const [transfer, setTransfer] = useState(false);
  const { run } = useAction();

  async function search(u = uid) {
    setErr(null);
    const r = await run(() => api(`/tags?uid=${encodeURIComponent(u.trim())}`)).catch(() => undefined);
    if (r) setData(r); else { setData(null); setErr("No se encontró un tag con ese UID"); }
  }
  const t = data?.tag;
  return (
    <>
      <Card>
        <form className="row" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input className="inline-input" style={{ maxWidth: 320 }} aria-label="UID del tag" placeholder="UID del tag (14 hex)" value={uid} onChange={(e) => setUid(e.target.value)} />
          <button className="btn primary" disabled={uid.trim().length < 6}>Buscar</button>
        </form>
        {err && <p className="error">{err}</p>}
      </Card>
      {t && (
        <>
          <Card title={`Tag ${t.uid}`} actions={<>
            {can("tags.manage") && <Btn onClick={() => setBlock(t.status !== "blocked")}>{t.status === "blocked" ? "Desbloquear tag" : "Bloquear tag"}</Btn>}
            {can("tags.transfer") && t.status === "claimed" && <Btn onClick={() => setTransfer(true)}>Transferir a otra clienta</Btn>}
          </>}>
            <div className="form-grid">
              <p><b>Estado:</b> <Badge value={t.status} />{t.batch_status === "blocked" && <> <Badge value="blocked" /> lote bloqueado</>}</p>
              <p><b>Presentación:</b> {t.product_name} · {t.variant_name}</p>
              <p><b>Lote:</b> {t.batch_code}</p>
              <p><b>Contador:</b> {t.last_counter}</p>
              <p><b>Clienta:</b> {t.user_id ? <a href={`/admin/customers/${t.user_id}`}>{t.user_email ?? t.user_name ?? t.user_id}</a> : "—"}</p>
              <p><b>Reclamado:</b> {fmtDate(t.claimed_at)}</p>
              <p><b>Pedido Shopify:</b> {t.shopify_order_id ?? "—"}</p>
              {t.blocked_reason && <p><b>Motivo de bloqueo:</b> {t.blocked_reason}</p>}
            </div>
          </Card>
          <Card title="Historial de lecturas">
            <Table rows={data.scans} empty="Sin lecturas" cols={[
              { header: "Fecha", cell: (s: any) => fmtDate(s.server_time) },
              { header: "Contador", cell: (s: any) => s.counter ?? "—" },
              { header: "Resultado", cell: (s: any) => <>{RESULT[s.result] ?? s.result}{s.reason && <> · <span className="muted">{s.reason}</span></>}</> },
              { header: "Clienta", cell: (s: any) => s.user_email ?? "—" },
              { header: "Sin conexión", cell: (s: any) => (s.offline ? `sí (${fmtDate(s.device_time)})` : "no") },
            ]} />
          </Card>
        </>
      )}
      {block !== null && t && <PromptModal danger={block} title={`${block ? "Bloquear" : "Desbloquear"} tag ${t.uid}`} label="Motivo" confirm={block ? "Bloquear" : "Desbloquear"} onClose={() => setBlock(null)}
        onSubmit={async (reason) => { await api(`/tags/${t.uid}/block`, { body: { blocked: block, reason } }); await search(t.uid); }} />}
      {transfer && t && <TransferModal uid={t.uid} onClose={() => setTransfer(false)} onDone={() => { setTransfer(false); search(t.uid); }} />}
    </>
  );
}

function TransferModal({ uid, onClose, onDone }: { uid: string; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<any[]>([]);
  const [to, setTo] = useState<any>(null);
  const [reason, setReason] = useState("");
  const { run, busy } = useAction();
  return (
    <Modal title={`Transferir tag ${uid}`} onClose={onClose}>
      <form className="row" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api(`/customers?q=${encodeURIComponent(q)}`)); if (r) setFound(r.customers); }}>
        <input className="inline-input" style={{ flex: 1 }} aria-label="Buscar clienta destino" placeholder="Correo, teléfono o nombre (mín. 3)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" disabled={q.trim().length < 3}>Buscar</button>
      </form>
      <Table rows={found} empty="Busca a la clienta que recibirá el tag" onRow={setTo} cols={[
        { header: "Clienta", cell: (c: any) => <>{to?.id === c.id ? "✔ " : ""}{c.name ?? "—"} · {c.email}</> },
      ]} />
      <Field label="Motivo"><textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="row end"><Btn onClick={onClose}>Cancelar</Btn>
        <button className="btn primary" disabled={busy || !to || reason.trim().length < 5} onClick={async () => { const r = await run(() => api(`/tags/${uid}/transfer`, { body: { to_user_id: to.id, reason: reason.trim() } }), "Tag transferido"); if (r) onDone(); }}>Transferir</button></div>
    </Modal>
  );
}
