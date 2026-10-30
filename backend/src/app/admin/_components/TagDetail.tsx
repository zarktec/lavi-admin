"use client";
import Link from "next/link";
import { useState } from "react";
import { api, fmtDate } from "../_lib/api";
import { useMe } from "../(app)/layout";
import { Badge, Btn, Card, Field, Loading, Modal, PromptModal, Table, useAction, useLoad } from "./ui";

export const RESULT: Record<string, string> = { activation_required: "Activación", dose_recorded: "Dosis a tiempo", too_early: "Muy temprano", late: "Tarde", no_pending_dose: "Sin dosis pendiente", treatment_finished: "Tratamiento terminado", rejected: "Rechazada" };

/** Detalle de un tag: estado, clienta, acciones (bloquear, transferir, liberar) e historial de lecturas. */
export function TagDetail({ uid, onChanged }: { uid: string; onChanged?: () => void }) {
  const { can } = useMe();
  const { data, error, loading, reload } = useLoad<any>(`/tags?uid=${encodeURIComponent(uid.trim())}`);
  const [block, setBlock] = useState<boolean | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [release, setRelease] = useState(false);
  const t = data?.tag;
  const changed = () => { reload(); onChanged?.(); };
  return (
    <>
      <Loading error={error && "No se encontró un tag con ese UID"} loading={loading && !data} />
      {t && (
        <>
          <Card title={`Tag ${t.uid}`} actions={<>
            {can("tags.manage") && <Btn onClick={() => setBlock(t.status !== "blocked")}>{t.status === "blocked" ? "Desbloquear tag" : "Bloquear tag"}</Btn>}
            {can("tags.transfer") && t.status === "claimed" && <Btn onClick={() => setTransfer(true)}>Transferir a otra clienta</Btn>}
            {can("tags.release") && t.user_id && <Btn onClick={() => setRelease(true)}>Liberar tag</Btn>}
          </>}>
            <div className="form-grid">
              <p><b>Estado:</b> <Badge value={t.status} />{t.batch_status === "blocked" && <> <Badge value="blocked" /> lote bloqueado</>}</p>
              <p><b>Presentación:</b> {t.product_name} · {t.variant_name}</p>
              <p><b>Lote:</b> {t.batch_id ? <Link href={`/admin/tags/batches/${t.batch_id}`}>{t.batch_code}</Link> : t.batch_code}</p>
              <p><b>Contador:</b> {t.last_counter}</p>
              <p><b>Clienta:</b> {t.user_id ? <Link href={`/admin/customers/${t.user_id}`}>{t.user_email ?? t.user_name ?? t.user_id}</Link> : "—"}</p>
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
        onSubmit={async (reason) => { await api(`/tags/${t.uid}/block`, { body: { blocked: block, reason } }); changed(); }} />}
      {release && t && <PromptModal danger min={5} title={`Liberar tag ${t.uid}`} label="Motivo. Se borra el tratamiento de la clienta (sus puntos se conservan) y el tag queda sin reclamar. Queda en la bitácora." confirm="Liberar tag" onClose={() => setRelease(false)}
        onSubmit={async (reason) => { await api(`/tags/${t.uid}/release`, { body: { reason } }); setRelease(false); changed(); }} />}
      {transfer && t && <TransferModal uid={t.uid} onClose={() => setTransfer(false)} onDone={() => { setTransfer(false); changed(); }} />}
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
