"use client";
import { useState } from "react";
import { Badge, Btn, Card, Field, Loading, Modal, PageHeader, Table, useAction, useLoad } from "../../_components/ui";
import { api, cop, fmtDate } from "../../_lib/api";
import { useMe } from "../layout";

export default function CatalogPage() {
  const { can } = useMe();
  const { data, error, loading, reload } = useLoad<any>("/products");
  const [productModal, setProductModal] = useState<any | "new" | null>(null);
  const [variantModal, setVariantModal] = useState<{ product: any; variant?: any } | null>(null);
  const [configsFor, setConfigsFor] = useState<any | null>(null);
  const manage = can("catalog.manage");

  return (
    <>
      <PageHeader title="Catálogo">{manage && <Btn kind="primary" onClick={() => setProductModal("new")}>Nuevo producto</Btn>}</PageHeader>
      <Loading error={error} loading={loading} />
      {data?.products.map((p: any) => (
        <Card key={p.id} title={p.name} actions={<>
          {!p.active && <Badge value="disabled" />}
          {manage && <Btn className="sm" onClick={() => setProductModal(p)}>Editar</Btn>}
          {manage && <Btn className="sm" onClick={() => setVariantModal({ product: p })}>Agregar presentación</Btn>}
        </>}>
          {p.description && <p className="muted">{p.description}</p>}
          <Table rows={p.variants} empty="Sin presentaciones" cols={[
            { header: "Presentación", cell: (v: any) => <>{v.name} {!v.active && <Badge value="disabled" />}</> },
            { header: "Volumen", cell: (v: any) => (v.volume_ml ? `${v.volume_ml} ml` : "—") },
            { header: "SKU", cell: (v: any) => v.sku ?? "—" },
            { header: "Variante Shopify", cell: (v: any) => v.shopify_variant_id ?? <span className="muted">sin vincular</span> },
            { header: "Config. vigente", cell: (v: any) => (v.current_version ? `v${v.current_version}` : <span className="error">sin publicar</span>) },
            { header: "Tags", cell: (v: any) => `${v.tags_unclaimed}/${v.tags_total} libres` },
            { header: "", cell: (v: any) => <div className="row">
              <Btn className="sm" onClick={() => setConfigsFor(v)}>Configuración</Btn>
              {manage && <Btn className="sm" onClick={() => setVariantModal({ product: p, variant: v })}>Editar</Btn>}
            </div> },
          ]} />
        </Card>
      ))}
      {productModal && <ProductModal product={productModal === "new" ? null : productModal} onClose={() => setProductModal(null)} onSaved={() => { setProductModal(null); reload(); }} />}
      {variantModal && <VariantModal {...variantModal} onClose={() => setVariantModal(null)} onSaved={() => { setVariantModal(null); reload(); }} />}
      {configsFor && <ConfigsModal variant={configsFor} canManage={manage} onClose={() => { setConfigsFor(null); reload(); }} />}
    </>
  );
}

function ProductModal({ product, onClose, onSaved }: { product: any | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const { run, busy } = useAction();
  return (
    <Modal title={product ? "Editar producto" : "Nuevo producto"} onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(() => product ? api(`/products/${product.id}`, { method: "PATCH", body: { name, description, active } }) : api("/products", { body: { name, description } }), "Guardado");
        if (r) onSaved();
      }}>
        <Field label="Nombre"><input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Descripción"><textarea rows={3} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} /></Field>
        {product && <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activo</label>}
        <div className="row end"><Btn onClick={onClose}>Cancelar</Btn><button className="btn primary" disabled={busy}>Guardar</button></div>
      </form>
    </Modal>
  );
}

function VariantModal({ product, variant, onClose, onSaved }: { product: any; variant?: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: variant?.name ?? "", sku: variant?.sku ?? "", shopify_variant_id: variant?.shopify_variant_id ?? "", volume_ml: variant?.volume_ml ?? "", active: variant?.active ?? true });
  const { run, busy } = useAction();
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Modal title={variant ? `Editar ${variant.name}` : `Nueva presentación de ${product.name}`} onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const body = { name: f.name, sku: f.sku || null, shopify_variant_id: f.shopify_variant_id || null, volume_ml: f.volume_ml === "" ? null : Number(f.volume_ml), ...(variant ? { active: f.active } : {}) };
        const r = await run(() => variant ? api(`/variants/${variant.id}`, { method: "PATCH", body }) : api(`/products/${product.id}/variants`, { body }), "Guardado");
        if (r) onSaved();
      }}>
        <Field label="Nombre (p. ej. 100 ml)"><input required value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <div className="form-grid">
          <Field label="Volumen (ml)"><input type="number" min={1} value={f.volume_ml} onChange={(e) => set("volume_ml", e.target.value)} /></Field>
          <Field label="SKU"><input value={f.sku} onChange={(e) => set("sku", e.target.value)} /></Field>
        </div>
        <Field label="ID de variante en Shopify" hint="Número o gid://shopify/ProductVariant/… (lo usa el vínculo de compras y devoluciones)"><input value={f.shopify_variant_id} onChange={(e) => set("shopify_variant_id", e.target.value)} /></Field>
        {variant && <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Activa</label>}
        <div className="row end"><Btn onClick={onClose}>Cancelar</Btn><button className="btn primary" disabled={busy}>Guardar</button></div>
      </form>
    </Modal>
  );
}

const NUM = (v: any) => (v === "" || v == null ? 0 : Number(v));

function ConfigsModal({ variant, canManage, onClose }: { variant: any; canManage: boolean; onClose: () => void }) {
  const { data, error, loading, reload } = useLoad<any>(`/variants/${variant.id}/configs`);
  const [creating, setCreating] = useState(false);
  return (
    <Modal wide title={`Configuración de ${variant.name}`} onClose={onClose}>
      <p className="muted">Las versiones publicadas no se editan: un cambio crea una versión nueva y los tratamientos ya activos conservan la suya.</p>
      {canManage && !creating && <Btn kind="primary" onClick={() => setCreating(true)}>Publicar nueva versión</Btn>}
      {creating && <ConfigForm variantId={variant.id} base={data?.configs?.[0]} onCancel={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      <Loading error={error} loading={loading} />
      {data && <Table rows={data.configs} empty="Aún no hay versiones publicadas" cols={[
        { header: "Versión", cell: (c: any) => `v${c.version}` },
        { header: "Vigente desde", cell: (c: any) => fmtDate(c.effective_from) },
        { header: "Uso", cell: (c: any) => `${c.doses_per_day}/día × ${c.duration_days} días · ${c.default_reminder_times.join(", ")} · ventana −${c.window_minutes_before}/+${c.window_minutes_after} min` },
        { header: "Puntos", cell: (c: any) => `${c.points_per_dose}/dosis · bienvenida ${c.welcome_points} · penal. ${c.missed_dose_penalty} · tope ${c.max_points_per_treatment ?? "—"}` },
        { header: "Rachas", cell: (c: any) => c.streak_rules.map((r: any) => `${r.streak_length} → +${r.bonus_points}${r.repeatable ? " (repite)" : ""}`).join("; ") || "—" },
        { header: "Cambios de horario", cell: (c: any) => `${c.schedule_change_max_count} cada ${c.schedule_change_period_days} d, aviso ${c.schedule_change_min_notice_hours} h` },
      ]} />}
    </Modal>
  );
}

function ConfigForm({ variantId, base, onCancel, onDone }: { variantId: string; base?: any; onCancel: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({
    doses_per_day: base?.doses_per_day ?? 1,
    default_reminder_times: (base?.default_reminder_times ?? ["08:00"]).join(", "),
    window_minutes_before: base?.window_minutes_before ?? 60,
    window_minutes_after: base?.window_minutes_after ?? 60,
    duration_days: base?.duration_days ?? 30,
    points_per_dose: base?.points_per_dose ?? 10,
    missed_dose_penalty: base?.missed_dose_penalty ?? 0,
    late_dose_avoids_penalty: base?.late_dose_avoids_penalty ?? false,
    max_points_per_treatment: base?.max_points_per_treatment ?? "",
    welcome_points: base?.welcome_points ?? 0,
    reminder_nudges: (base?.reminder_nudges ?? [0, 15, 30]).join(", "),
    backup_push_enabled: base?.backup_push_enabled ?? true,
    schedule_change_min_notice_hours: base?.schedule_change_min_notice_hours ?? 12,
    schedule_change_max_count: base?.schedule_change_max_count ?? 2,
    schedule_change_period_days: base?.schedule_change_period_days ?? 30,
    repurchase_reminder_days: base?.repurchase_reminder_days ?? 7,
    effective_from: "",
  });
  const [rules, setRules] = useState<any[]>((base?.streak_rules ?? []).map((r: any) => ({ streak_length: r.streak_length, bonus_points: r.bonus_points, repeatable: r.repeatable })));
  const [sim, setSim] = useState<any>(null);
  const { run, busy } = useAction();
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const list = (s: string) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

  const payload = () => ({
    doses_per_day: NUM(f.doses_per_day),
    default_reminder_times: list(f.default_reminder_times),
    window_minutes_before: NUM(f.window_minutes_before),
    window_minutes_after: NUM(f.window_minutes_after),
    duration_days: NUM(f.duration_days),
    points_per_dose: NUM(f.points_per_dose),
    missed_dose_penalty: NUM(f.missed_dose_penalty),
    late_dose_avoids_penalty: f.late_dose_avoids_penalty,
    max_points_per_treatment: f.max_points_per_treatment === "" ? null : NUM(f.max_points_per_treatment),
    welcome_points: NUM(f.welcome_points),
    reminder_nudges: list(f.reminder_nudges).map(Number),
    backup_push_enabled: f.backup_push_enabled,
    schedule_change_min_notice_hours: NUM(f.schedule_change_min_notice_hours),
    schedule_change_max_count: NUM(f.schedule_change_max_count),
    schedule_change_period_days: NUM(f.schedule_change_period_days),
    repurchase_reminder_days: NUM(f.repurchase_reminder_days),
    ...(f.effective_from ? { effective_from: new Date(f.effective_from).toISOString() } : {}),
    streak_rules: rules.map((r) => ({ streak_length: NUM(r.streak_length), bonus_points: NUM(r.bonus_points), repeatable: !!r.repeatable })),
  });

  async function simulate() {
    const p = payload();
    const r = await run(() => api("/configs/simulate", { body: { doses_per_day: p.doses_per_day, duration_days: p.duration_days, points_per_dose: p.points_per_dose, welcome_points: p.welcome_points, max_points_per_treatment: p.max_points_per_treatment, streak_rules: p.streak_rules } }));
    if (r) setSim(r);
  }

  const N = (label: string, k: string, hint?: string, min = 0) => <Field label={label} hint={hint}><input type="number" min={min} value={f[k]} onChange={(e) => set(k, e.target.value)} required={k !== "max_points_per_treatment"} /></Field>;

  return (
    <form className="card" style={{ background: "#faf8f3" }} onSubmit={async (e) => {
      e.preventDefault();
      if (!confirm("¿Publicar esta configuración como una versión nueva? No podrá editarse después.")) return;
      const r = await run(() => api(`/variants/${variantId}/configs`, { body: payload() }), "Versión publicada");
      if (r) onDone();
    }}>
      <h2>Nueva versión</h2>
      <div className="form-grid">
        {N("Aplicaciones por día", "doses_per_day", undefined, 1)}
        <Field label="Horarios sugeridos (HH:mm, separados por coma)" hint="Debe haber uno por aplicación diaria"><input value={f.default_reminder_times} onChange={(e) => set("default_reminder_times", e.target.value)} required /></Field>
        {N("Minutos de tolerancia antes", "window_minutes_before")}
        {N("Minutos de tolerancia después", "window_minutes_after")}
        {N("Duración del tratamiento (días)", "duration_days", undefined, 1)}
        {N("Puntos por dosis a tiempo", "points_per_dose")}
        {N("Penalización por dosis perdida", "missed_dose_penalty", "0 = sin penalización")}
        {N("Tope de puntos por frasco", "max_points_per_treatment", "Vacío = sin tope")}
        {N("Puntos de bienvenida", "welcome_points")}
        <Field label="Insistencias del recordatorio (minutos desde que abre la ventana)" hint="Ej. 0, 15, 30"><input value={f.reminder_nudges} onChange={(e) => set("reminder_nudges", e.target.value)} /></Field>
        {N("Anticipación mínima de cambio de horario (h)", "schedule_change_min_notice_hours")}
        {N("Cambios de horario permitidos", "schedule_change_max_count")}
        {N("Periodo de esos cambios (días)", "schedule_change_period_days", undefined, 1)}
        {N("Días antes del fin para sugerir recompra", "repurchase_reminder_days")}
        <Field label="Vigente desde (opcional)" hint="Vacío = de inmediato"><input type="datetime-local" value={f.effective_from} onChange={(e) => set("effective_from", e.target.value)} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.late_dose_avoids_penalty} onChange={(e) => set("late_dose_avoids_penalty", e.target.checked)} /> Una aplicación tardía evita la penalización</label>
      <label className="check"><input type="checkbox" checked={f.backup_push_enabled} onChange={(e) => set("backup_push_enabled", e.target.checked)} /> Push de respaldo a mitad de ventana</label>

      <h3>Reglas de racha</h3>
      {rules.map((r, i) => (
        <div className="rule-row" key={i}>
          <Field label="Dosis seguidas"><input type="number" min={1} value={r.streak_length} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, streak_length: e.target.value } : x)))} /></Field>
          <Field label="Puntos de bono"><input type="number" min={0} value={r.bonus_points} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, bonus_points: e.target.value } : x)))} /></Field>
          <label className="check" style={{ paddingBottom: 14 }}><input type="checkbox" checked={r.repeatable} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, repeatable: e.target.checked } : x)))} /> Se repite</label>
          <Btn kind="link" onClick={() => setRules(rules.filter((_, j) => j !== i))} aria-label="Quitar regla">Quitar</Btn>
        </div>
      ))}
      <Btn className="sm" onClick={() => setRules([...rules, { streak_length: 7, bonus_points: 10, repeatable: false }])}>Agregar regla</Btn>

      <h3>Simulador de costo máximo</h3>
      <div className="row"><Btn onClick={simulate} disabled={busy}>Calcular con adherencia perfecta</Btn></div>
      {sim && (
        <div className="notice" style={{ marginTop: 8 }}>
          <b>{sim.max_points} puntos ≈ {cop(sim.max_cost_cop)}</b> por tratamiento (1 punto = {cop(sim.point_value_cop)}).<br />
          {sim.total_doses} dosis × puntos = {sim.dose_points} · rachas {sim.streak_points} · bienvenida {sim.welcome_points}
          {sim.capped && <> · <b>limitado por el tope</b> (sin tope: {sim.uncapped_points})</>}
        </div>
      )}
      <div className="row end"><Btn onClick={onCancel}>Cancelar</Btn><button className="btn primary" disabled={busy}>Publicar versión</button></div>
    </form>
  );
}
