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
          <div key={i.id} className={`toast ${i.kind}`}>{i.msg}</div>
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

// ───── Componentes ─────
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      <div className="row">{children}</div>
    </header>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          <div className="row">{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export function Btn({ kind = "default", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "default" | "primary" | "danger" | "link" }) {
  return <button type="button" {...p} className={`btn ${kind} ${p.className ?? ""}`} />;
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
export function Table<T>({ rows, cols, empty = "Sin resultados", onRow }: { rows: T[]; cols: Col<T>[]; empty?: string; onRow?: (r: T) => void }) {
  if (!rows.length) return <p className="muted pad">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{cols.map((c) => <th key={c.header} className={c.align}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? "clickable" : ""}>
              {cols.map((c) => <td key={c.header} className={c.align}>{c.cell(r)}</td>)}
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
          <Btn kind="link" onClick={onClose} aria-label="Cerrar">✕</Btn>
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
  error ? <p className="error pad" role="alert">{error}</p> : loading ? <p className="muted pad">Cargando…</p> : null;

export const Json = ({ v }: { v: unknown }) => (v == null ? <span className="muted">—</span> : <pre className="json">{JSON.stringify(v, null, 1)}</pre>);
