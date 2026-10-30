"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, errMsg } from "../_lib/api";

// ───── Toast ─────
type ToastKind = "ok" | "error";
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: ToastKind }[]>([]);
  const push = useCallback((msg: string, kind: ToastKind = "ok") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg, kind }]);
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`toast ${i.kind}`}>
            <Icon name={i.kind === "error" ? "alert" : "check"} size={18} />
            <span>{i.msg}</span>
            <button type="button" aria-label="Cerrar aviso" onClick={() => setItems((s) => s.filter((x) => x.id !== i.id))}><Icon name="close" size={16} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ───── Carga de datos ─────
export function useLoad<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setLoading(true);
    api<T>(path)
      .then((d) => live && (setData(d), setError(null)))
      .catch((e) => live && setError(errMsg(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [path, n]);
  return { data, error, loading, reload: () => setN((x) => x + 1) };
}

/** Ejecuta una acción mostrando toast de éxito/error. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const r = await fn();
        if (okMsg) toast(okMsg);
        return r;
      } catch (e) {
        toast(errMsg(e), "error");
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { run, busy };
}

// ───── Iconos (trazos de 24 px, heredan el color del texto) ─────
const ICONS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  package: "M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-8L3 8m9 5v8M3 8v8l9 5",
  tag: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8",
  star: "M12 2l3.1 6.3 6.9 1-5 4.8 1.2 6.9L12 17.8 5.8 21 7 14.1 2 9.3l6.9-1z",
  chart: "M3 3v18h18M7 14l3-3 3 3 5-6",
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  log: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 3h6v4H9zM9 12h6M9 16h6",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  menu: "M3 6h18M3 12h18M3 18h18",
  close: "M18 6 6 18M6 6l12 12",
  alert: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  check: "M20 6 9 17l-5-5",
  "check-circle": "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 18l-6-6 6-6",
  search: "M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z",
  gift: "M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
  radar: "M19.1 4.9A10 10 0 1 0 21.7 14M15 9a5 5 0 1 0 2.8 4.8M12 12l7-7",
};
export type IconName = keyof typeof ICONS;
export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className ?? ""}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function EmptyState({ title, children, icon = "inbox", action }: { title: string; children?: ReactNode; icon?: IconName; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico"><Icon name={icon} size={26} /></div>
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action && <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>{action}</div>}
    </div>
  );
}

/** Tarjeta de indicador. Con `href` es una acción: lleva a donde se resuelve (los pendientes se pintan según severidad). */
export function Stat({ label, value, hint, icon, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: IconName; href?: string; tone?: "ok" | "warn" | "bad" }) {
  const inner = href ? (
    <>
      {icon && <div className="ico"><Icon name={icon} size={22} /></div>}
      <div className="body"><div className="label">{label}</div><div className="value">{value ?? "—"}</div>{hint && <div className="hint">{hint}</div>}</div>
      <Icon name="arrow" size={18} className="go" />
    </>
  ) : (
    <>
      <div className="label">{icon && <Icon name={icon} size={16} />}{label}</div>
      <div className="value">{value ?? "—"}</div>
      {hint && <div className="hint">{hint}</div>}
    </>
  );
  if (href) return <a className={`stat action ${tone ?? ""}`} href={href}>{inner}</a>;
  return <div className="stat">{inner}</div>;
}

/** Barra de progreso accesible (valor 0–1). */
export function Bar({ value, tone, label }: { value: number; tone?: "ok" | "warn" | "bad"; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return <div className={`bar ${tone ?? ""}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${v * 100}%` }} /></div>;
}

// ───── Componentes ─────
export function PageHeader({ title, subtitle, crumbs, children }: { title: string; subtitle?: ReactNode; crumbs?: { label: string; href?: string }[]; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="titles">
        {crumbs && crumbs.length > 0 && (
          <nav className="crumbs" aria-label="Ruta">
            {crumbs.map((c, i) => (
              <span key={i} className="row" style={{ gap: 6 }}>
                {i > 0 && <span className="sep" aria-hidden="true">/</span>}
                {c.href ? <a href={c.href}>{c.label}</a> : <span aria-current="page">{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      <div className="row">{children}</div>
    </header>
  );
}

export function Card({ title, description, children, actions, flush }: { title?: string; description?: ReactNode; children: ReactNode; actions?: ReactNode; flush?: boolean }) {
  return (
    <section className={`card ${flush ? "flush" : ""}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p className="desc">{description}</p>}
          </div>
          <div className="row">{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export function Btn({ kind = "default", loading, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "default" | "primary" | "danger" | "danger-outline" | "link"; loading?: boolean }) {
  return <button type="button" {...p} disabled={p.disabled || loading} aria-busy={loading || undefined} className={`btn ${kind} ${p.className ?? ""}`} />;
}

const BADGE: Record<string, string> = {
  active: "ok", applied: "ok", on_time: "ok", issued: "ok", used: "ok", claimed: "info", finished: "info", late: "warn", pending: "warn", pending_approval: "warn", scheduled: "muted",
  unclaimed: "muted", missed: "bad", blocked: "bad", failed: "bad", disabled: "bad", rejected: "bad", expired: "muted", cancelled: "muted",
};
const LABEL: Record<string, string> = {
  active: "Activo", applied: "Aplicado", on_time: "A tiempo", issued: "Emitido", used: "Usado", claimed: "Reclamado", finished: "Terminado", late: "Tarde", pending: "Pendiente",
  pending_approval: "Por aprobar", scheduled: "Programada", unclaimed: "Sin reclamar", missed: "Perdida", blocked: "Bloqueado", failed: "Fallido", disabled: "Desactivado",
  rejected: "Rechazado", expired: "Vencido", cancelled: "Cancelado", deleted: "Eliminada",
};
export const Badge = ({ value }: { value: string }) => <span className={`badge ${BADGE[value] ?? "muted"}`}>{LABEL[value] ?? value}</span>;

export interface Col<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "right";
}
/** Columnas de fecha, UID o importes: no se parten en dos líneas. */
const NOWRAP = /fecha|alta|importado|reclamado|ingreso|vence|rige|pidió|creado|uid|saldo|puntos|contador|dosis|costo|pts/i;
export function Table<T>({ rows, cols, empty = "Sin resultados", onRow }: { rows: T[]; cols: Col<T>[]; empty?: string; onRow?: (r: T) => void }) {
  if (!rows.length) return <EmptyState title={empty} icon="inbox" />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{cols.map((c) => <th key={c.header} scope="col" className={c.align}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? "clickable" : ""}>
              {cols.map((c) => <td key={c.header} className={`${c.align ?? ""} ${NOWRAP.test(c.header) ? "nowrap" : ""}`}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Controles de paginación: «Anterior / Siguiente», rango mostrado y tamaño de página. */
export function Pagination({ page, pageSize, total, totalPages, onPage, onPageSize, disabled, noun = "resultados" }: {
  page: number; pageSize: number; total: number; totalPages: number; noun?: string; disabled?: boolean;
  onPage: (p: number) => void; onPageSize?: (n: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="row pager" aria-label="Paginación" style={{ justifyContent: "space-between", marginTop: 12 }}>
      <span className="muted" aria-live="polite">{total === 0 ? `Sin ${noun}` : `${from}–${to} de ${total} ${noun}`}</span>
      <div className="row">
        {onPageSize && (
          <label className="row muted" style={{ gap: 6 }}>
            Por página
            <select className="inline-input" style={{ width: "auto" }} value={pageSize} disabled={disabled} onChange={(e) => onPageSize(Number(e.target.value))}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <Btn className="sm" disabled={disabled || page <= 1} onClick={() => onPage(1)} aria-label="Primera página">«</Btn>
        <Btn className="sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>Anterior</Btn>
        <span aria-current="page">Página {page} de {totalPages}</span>
        <Btn className="sm" disabled={disabled || page >= totalPages} onClick={() => onPage(page + 1)}>Siguiente</Btn>
        <Btn className="sm" disabled={disabled || page >= totalPages} onClick={() => onPage(totalPages)} aria-label="Última página">»</Btn>
      </div>
    </nav>
  );
}

export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="card-head">
          <h2>{title}</h2>
          <Btn kind="link" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={18} /></Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Modal que pide un texto (motivo) antes de confirmar. */
export function PromptModal({ title, label, min = 3, confirm = "Confirmar", danger, onClose, onSubmit }: {
  title: string; label: string; min?: number; confirm?: string; danger?: boolean; onClose: () => void; onSubmit: (text: string) => Promise<unknown>;
}) {
  const [text, setText] = useState("");
  const { run, busy } = useAction();
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={async (e) => { e.preventDefault(); const r = await run(() => onSubmit(text.trim())); if (r !== undefined) onClose(); }}>
        <Field label={label}><textarea required minLength={min} rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="row end"><Btn onClick={onClose}>Cancelar</Btn><button className={`btn ${danger ? "danger" : "primary"}`} disabled={busy || text.trim().length < min}>{confirm}</button></div>
      </form>
    </Modal>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? "active" : ""} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

export const Loading = ({ error, loading }: { error: string | null; loading: boolean }) =>
  error ? (
    <div className="notice" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>
  ) : loading ? (
    <div className="skeleton" role="status" aria-label="Cargando"><i /><i /><i /></div>
  ) : null;

export const Json = ({ v }: { v: unknown }) => (v == null ? <span className="muted">—</span> : <pre className="json">{JSON.stringify(v, null, 1)}</pre>);

/** Marco de las pantallas de acceso: panel de marca a la izquierda y formulario a la derecha (solo formulario en móvil). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand" aria-hidden="true">
        <div className="brand"><div className="logo">L</div><div>Lavi<small>Panel administrativo</small></div></div>
        <div>
          <h2>Adherencia que se nota, puntos que se ganan.</h2>
          <p>Gestiona clientas, tags, puntos y canjes del programa en un solo lugar.</p>
          <ul><li>Acceso protegido con verificación en dos pasos</li><li>Cada acción queda en la bitácora</li><li>Roles y permisos por área</li></ul>
        </div>
        <small style={{ color: "#a9a3c9" }}>© Lavi</small>
      </aside>
      <div className="auth-panel"><main className="auth" id="contenido">{children}</main></div>
    </div>
  );
}
