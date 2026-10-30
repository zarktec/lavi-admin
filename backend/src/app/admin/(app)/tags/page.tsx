"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Btn, Card, Field, Loading, Modal, PageHeader, PromptModal, Table, Tabs, useAction, useLoad } from "../../_components/ui";
import { TagDetail } from "../../_components/TagDetail";
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
  const router = useRouter();
  return (
    <>
      <Card title="Lotes importados" actions={can("tags.manage") && <Btn kind="primary" onClick={() => setImporting(true)}>Importar lote</Btn>}>
        <Loading error={error} loading={loading} />
        {data && <Table rows={data.batches} empty="Aún no hay lotes" onRow={(b: any) => router.push(`/admin/tags/batches/${b.id}`)} cols={[
          { header: "Lote", cell: (b: any) => <Link href={`/admin/tags/batches/${b.id}`} onClick={(e) => e.stopPropagation()}>{b.batch_code}</Link> },
          { header: "Presentación", cell: (b: any) => `${b.product_name} · ${b.variant_name}` },
          { header: "Importado", cell: (b: any) => fmtDate(b.imported_at) },
          { header: "Tags", cell: (b: any) => `${b.tags_total} (${b.tags_claimed} reclamados, ${b.tags_blocked} bloqueados)` },
          { header: "Estado", cell: (b: any) => <Badge value={b.status} /> },
          { header: "", cell: (b: any) => can("tags.manage") && <Btn className="sm" onClick={(e) => { e.stopPropagation(); setBlock({ batch: b, blocked: b.status !== "blocked" }); }}>{b.status === "blocked" ? "Desbloquear" : "Bloquear"}</Btn> },
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

function TagSearch() {
  const [uid, setUid] = useState("");
  const [applied, setApplied] = useState("");
  return (
    <>
      <Card>
        <form className="row" onSubmit={(e) => { e.preventDefault(); setApplied(uid.trim()); }}>
          <input className="inline-input" style={{ maxWidth: 320 }} aria-label="UID del tag" placeholder="UID del tag (14 hex)" value={uid} onChange={(e) => setUid(e.target.value)} />
          <button className="btn primary" disabled={uid.trim().length < 6}>Buscar</button>
        </form>
      </Card>
      {applied && <TagDetail key={applied} uid={applied} />}
    </>
  );
}
