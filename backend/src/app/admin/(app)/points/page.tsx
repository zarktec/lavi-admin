"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Btn, Card, Field, Loading, Modal, PageHeader, PromptModal, Table, useAction, useLoad } from "../../_components/ui";
import { api, cop, fmtDate } from "../../_lib/api";
import { useMe } from "../layout";

const TYPES: Record<string, string> = { fixed_amount: "Monto fijo (COP)", percentage: "Porcentaje", free_product: "Producto gratis", free_shipping: "Envío gratis" };

export default function PointsPage() {
  const { can } = useMe();
  const manage = can("redemptions.manage");
  const opts = useLoad<any>("/redemption-options");
  const probs = useLoad<any>("/redemptions/problems");
  const [edit, setEdit] = useState<any | "new" | null>(null);
  const [reverse, setReverse] = useState<any | null>(null);
  const { run, busy } = useAction();

  return (
    <>
      <PageHeader title="Puntos y canjes" subtitle="Opciones de canje y cola de canjes que necesitan atención.">{manage && <Btn kind="primary" onClick={() => setEdit("new")}>Nueva opción de canje</Btn>}</PageHeader>
      <Card title="Opciones de canje">
        <p className="muted">Editar una opción solo afecta canjes futuros; los códigos ya emitidos no cambian.</p>
        <Loading error={opts.error} loading={opts.loading} />
        {opts.data && <Table rows={opts.data.options} empty="Aún no hay opciones" cols={[
          { header: "Nombre", cell: (o: any) => o.name },
          { header: "Costo", cell: (o: any) => `${o.points_cost} pts`, align: "right" },
          { header: "Beneficio", cell: (o: any) => <>{TYPES[o.reward_type]}{o.reward_value != null && ` · ${o.reward_type === "fixed_amount" ? cop(Number(o.reward_value)) : o.reward_type === "percentage" ? `${Number(o.reward_value)} %` : Number(o.reward_value)}`}{o.shopify_product_id && <span className="muted"> · producto {o.shopify_product_id}</span>}</> },
          { header: "Combina con", cell: (o: any) => ["productDiscounts", "orderDiscounts", "shippingDiscounts"].filter((k) => o.combines_with?.[k]).map((k) => ({ productDiscounts: "productos", orderDiscounts: "pedido", shippingDiscounts: "envío" } as any)[k]).join(", ") || "nada" },
          { header: "Estado", cell: (o: any) => <Badge value={o.active ? "active" : "disabled"} /> },
          { header: "", cell: (o: any) => manage && <Btn className="sm" onClick={() => setEdit(o)}>Editar</Btn> },
        ]} />}
      </Card>
      <Card title="Cola de canjes con problemas">
        <Loading error={probs.error} loading={probs.loading} />
        {probs.data && <Table rows={probs.data.redemptions} empty="Sin canjes con problemas" cols={[
          { header: "Fecha", cell: (r: any) => fmtDate(r.created_at) },
          { header: "Clienta", cell: (r: any) => <Link href={`/admin/customers/${r.user_id}`}>{r.user_email}</Link> },
          { header: "Opción", cell: (r: any) => r.option_name },
          { header: "Puntos", cell: (r: any) => r.points, align: "right" },
          { header: "Estado", cell: (r: any) => <Badge value={r.status} /> },
          { header: "Error", cell: (r: any) => <span className="muted">{r.error ?? ""}</span> },
          { header: "", cell: (r: any) => manage && (
            <div className="row">
              {r.status === "pending" && <Btn className="sm" disabled={busy} onClick={async () => { const x = await run(() => api(`/redemptions/${r.id}/retry`, { body: {} })); if (x) { x.ok ? probs.reload() : probs.reload(); } }}>Reintentar</Btn>}
              {r.status === "pending" && <Btn className="sm" kind="danger-outline" onClick={() => setReverse(r)}>Revertir</Btn>}
            </div>) },
        ]} />}
        <p className="muted">Los canjes fallidos ya devolvieron los puntos a la clienta automáticamente.</p>
      </Card>
      {edit && <OptionModal option={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); opts.reload(); }} />}
      {reverse && <PromptModal danger title="Revertir canje" label="Nota para la bitácora" min={5} confirm="Revertir y devolver puntos" onClose={() => setReverse(null)}
        onSubmit={async (note) => { await api(`/redemptions/${reverse.id}/reverse`, { body: { note } }); probs.reload(); }} />}
    </>
  );
}

function OptionModal({ option, onClose, onSaved }: { option: any | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: option?.name ?? "", points_cost: option?.points_cost ?? 100, reward_type: option?.reward_type ?? "percentage",
    reward_value: option?.reward_value != null ? String(Number(option.reward_value)) : "", shopify_product_id: option?.shopify_product_id ?? "", active: option?.active ?? true,
    productDiscounts: option?.combines_with?.productDiscounts ?? false, orderDiscounts: option?.combines_with?.orderDiscounts ?? false, shippingDiscounts: option?.combines_with?.shippingDiscounts ?? false,
  });
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const { run, busy } = useAction();
  const needsValue = f.reward_type === "fixed_amount" || f.reward_type === "percentage";
  return (
    <Modal title={option ? "Editar opción de canje" : "Nueva opción de canje"} onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const body = { name: f.name, points_cost: Number(f.points_cost), reward_type: f.reward_type, reward_value: needsValue ? Number(f.reward_value) : null, shopify_product_id: f.shopify_product_id || null, active: f.active, combines_with: { productDiscounts: f.productDiscounts, orderDiscounts: f.orderDiscounts, shippingDiscounts: f.shippingDiscounts } };
        const r = await run(() => option ? api(`/redemption-options/${option.id}`, { method: "PATCH", body }) : api("/redemption-options", { body }), "Guardado");
        if (r) onSaved();
      }}>
        <Field label="Nombre"><input required value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <div className="form-grid">
          <Field label="Costo en puntos"><input type="number" min={1} required value={f.points_cost} onChange={(e) => set("points_cost", e.target.value)} /></Field>
          <Field label="Tipo de beneficio"><select value={f.reward_type} onChange={(e) => set("reward_type", e.target.value)}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        </div>
        {needsValue && <Field label={f.reward_type === "percentage" ? "Porcentaje (1–100)" : "Monto en pesos"}><input type="number" min={1} max={f.reward_type === "percentage" ? 100 : undefined} required value={f.reward_value} onChange={(e) => set("reward_value", e.target.value)} /></Field>}
        {(f.reward_type === "free_product" || f.reward_type === "fixed_amount" || f.reward_type === "percentage") && (
          <Field label="Producto de Shopify" hint={f.reward_type === "free_product" ? "Obligatorio: producto que se regala" : "Opcional: limita el descuento a ese producto"}><input required={f.reward_type === "free_product"} value={f.shopify_product_id} onChange={(e) => set("shopify_product_id", e.target.value)} placeholder="ID numérico o gid://shopify/Product/…" /></Field>
        )}
        <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8, marginBottom: 12 }}>
          <legend>Se puede combinar con otras promociones de…</legend>
          <label className="check"><input type="checkbox" checked={f.productDiscounts} onChange={(e) => set("productDiscounts", e.target.checked)} /> Descuentos de productos</label>
          <label className="check"><input type="checkbox" checked={f.orderDiscounts} onChange={(e) => set("orderDiscounts", e.target.checked)} /> Descuentos de pedido</label>
          <label className="check"><input type="checkbox" checked={f.shippingDiscounts} onChange={(e) => set("shippingDiscounts", e.target.checked)} /> Descuentos de envío</label>
        </fieldset>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Disponible para las clientas</label>
        <div className="row end"><Btn onClick={onClose}>Cancelar</Btn><button className="btn primary" disabled={busy}>Guardar</button></div>
      </form>
    </Modal>
  );
}
