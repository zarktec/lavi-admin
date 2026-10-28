"use client";
import { useState } from "react";
import { Badge, Btn, Card, Field, Loading, Modal, PageHeader, Table, Tabs, useAction, useLoad } from "../../_components/ui";
import { api, fmtDate } from "../../_lib/api";
import { useMe } from "../layout";

export default function TeamPage() {
  const { me } = useMe();
  const [tab, setTab] = useState("users");
  if (!me.admin.is_superadmin) return <p className="error">Solo el superadministrador administra el equipo.</p>;
  return (
    <>
      <PageHeader title="Equipo" />
      <Tabs value={tab} onChange={setTab} tabs={[["users", "Usuarios"], ["roles", "Roles y permisos"], ["invitations", "Invitaciones"]]} />
      {tab === "users" && <Users />}
      {tab === "roles" && <Roles />}
      {tab === "invitations" && <Invitations />}
    </>
  );
}

function Users() {
  const { me } = useMe();
  const users = useLoad<any>("/users");
  const roles = useLoad<any>("/roles");
  const { run, busy } = useAction();
  const patch = async (id: string, body: any, msg: string) => { if (await run(() => api(`/users/${id}`, { method: "PATCH", body }), msg)) users.reload(); };
  return (
    <Card>
      <Loading error={users.error} loading={users.loading} />
      {users.data && <Table rows={users.data.users} cols={[
        { header: "Nombre", cell: (u: any) => <>{u.name}<br /><span className="muted">{u.email}</span></> },
        { header: "Rol", cell: (u: any) => (
          <select aria-label={`Rol de ${u.name}`} className="inline-input" value={u.role_id} disabled={busy || u.id === me.admin.id} onChange={(e) => patch(u.id, { role_id: e.target.value }, "Rol actualizado")}>
            {roles.data?.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>) },
        { header: "Estado", cell: (u: any) => <><Badge value={u.status} />{u.locked_until && new Date(u.locked_until) > new Date() && <> <Badge value="blocked" /> bloqueo temporal</>}</> },
        { header: "Último ingreso", cell: (u: any) => fmtDate(u.last_login_at) },
        { header: "", cell: (u: any) => u.id !== me.admin.id && (
          <div className="row">
            {u.status === "disabled" ? <Btn className="sm" disabled={busy} onClick={() => patch(u.id, { status: "active" }, "Usuario reactivado")}>Reactivar</Btn>
              : <Btn className="sm" disabled={busy} onClick={() => confirm(`¿Desactivar a ${u.name}? Se cerrarán sus sesiones.`) && patch(u.id, { status: "disabled" }, "Usuario desactivado")}>Desactivar</Btn>}
            <Btn className="sm" disabled={busy} onClick={async () => { if (confirm(`¿Reiniciar la verificación en dos pasos de ${u.name}? Verá un QR nuevo en su próximo ingreso.`) && await run(() => api(`/users/${u.id}/reset-mfa`, { body: {} }), "2FA reiniciado")) users.reload(); }}>Reiniciar 2FA</Btn>
          </div>) },
      ]} />}
      <p className="muted">Los usuarios no se borran, solo se desactivan, para conservar la bitácora. No se puede desactivar ni degradar al último superadministrador.</p>
    </Card>
  );
}

function Roles() {
  const roles = useLoad<any>("/roles");
  const perms = useLoad<any>("/permissions");
  const [edit, setEdit] = useState<any | "new" | null>(null);
  const { run } = useAction();
  return (
    <Card title="Roles" actions={<Btn kind="primary" onClick={() => setEdit("new")}>Nuevo rol</Btn>}>
      <Loading error={roles.error} loading={roles.loading} />
      {roles.data && <Table rows={roles.data.roles} cols={[
        { header: "Rol", cell: (r: any) => <><b>{r.name}</b>{r.is_system && <> <Badge value="info" /></>}<br /><span className="muted">{r.description}</span></> },
        { header: "Usuarios", cell: (r: any) => r.users, align: "right" },
        { header: "Tope de ajuste", cell: (r: any) => r.max_adjustment ?? "—" },
        { header: "Permisos", cell: (r: any) => r.is_superadmin ? "Todos" : r.permissions.join(", ") || "—" },
        { header: "", cell: (r: any) => !r.is_superadmin && (
          <div className="row">
            <Btn className="sm" onClick={() => setEdit(r)}>Editar</Btn>
            {!r.is_system && <Btn className="sm" onClick={async () => { if (confirm(`¿Eliminar el rol ${r.name}?`) && await run(() => api(`/roles/${r.id}`, { method: "DELETE" }), "Rol eliminado")) roles.reload(); }}>Eliminar</Btn>}
          </div>) },
      ]} />}
      {edit && perms.data && <RoleModal role={edit === "new" ? null : edit} perms={perms.data.permissions.filter((p: any) => p.code !== "team.manage")} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); roles.reload(); }} />}
    </Card>
  );
}

function RoleModal({ role, perms, onClose, onSaved }: { role: any | null; perms: any[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [max, setMax] = useState(role?.max_adjustment ? String(role.max_adjustment) : "");
  const [sel, setSel] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const { run, busy } = useAction();
  return (
    <Modal wide title={role ? `Editar rol ${role.name}` : "Nuevo rol"} onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const body = { name, description: description || null, max_adjustment: max ? Number(max) : null, permissions: [...sel] };
        if (await run(() => role ? api(`/roles/${role.id}`, { method: "PATCH", body }) : api("/roles", { body }), "Rol guardado")) onSaved();
      }}>
        <div className="form-grid">
          <Field label="Nombre"><input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Tope de ajuste manual por movimiento" hint="Vacío = sin tope propio"><input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} /></Field>
          <Field label="Descripción" wide><input value={description ?? ""} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
          <legend>Permisos</legend>
          {perms.map((p) => (
            <label className="check" key={p.code}><input type="checkbox" checked={sel.has(p.code)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(p.code) : n.delete(p.code); setSel(n); }} /> <span><b>{p.code}</b> — {p.description}</span></label>
          ))}
        </fieldset>
        <div className="row end"><Btn onClick={onClose}>Cancelar</Btn><button className="btn primary" disabled={busy}>Guardar</button></div>
      </form>
    </Modal>
  );
}

function Invitations() {
  const inv = useLoad<any>("/invitations");
  const roles = useLoad<any>("/roles");
  const [f, setF] = useState({ email: "", name: "", role_id: "" });
  const { run, busy } = useAction();
  return (
    <>
      <Card title="Invitar a una persona">
        <form className="form-grid" onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api("/invitations", { body: { email: f.email, role_id: f.role_id, ...(f.name ? { name: f.name } : {}) } }), "Invitación enviada por correo")) { setF({ email: "", name: "", role_id: "" }); inv.reload(); }
        }}>
          <Field label="Correo"><input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Nombre (opcional)"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Rol"><select required value={f.role_id} onChange={(e) => setF({ ...f, role_id: e.target.value })}><option value="">Selecciona…</option>{roles.data?.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          <div style={{ alignSelf: "end", marginBottom: 12 }}><button className="btn primary" disabled={busy}>Enviar invitación</button></div>
        </form>
        <p className="muted">El enlace llega por correo y vence en horas; la persona define su contraseña y configura la verificación en dos pasos.</p>
      </Card>
      <Card title="Invitaciones">
        <Loading error={inv.error} loading={inv.loading} />
        {inv.data && <Table rows={inv.data.invitations} cols={[
          { header: "Correo", cell: (i: any) => i.email },
          { header: "Rol", cell: (i: any) => i.role_name },
          { header: "Creada", cell: (i: any) => fmtDate(i.created_at) },
          { header: "Estado", cell: (i: any) => i.accepted_at ? <Badge value="applied" /> : new Date(i.expires_at) < new Date() ? <Badge value="expired" /> : <Badge value="pending" /> },
          { header: "Vence", cell: (i: any) => fmtDate(i.expires_at) },
          { header: "", cell: (i: any) => !i.accepted_at && new Date(i.expires_at) > new Date() && <Btn className="sm" onClick={async () => { if (await run(() => api(`/invitations/${i.id}`, { method: "DELETE" }), "Invitación revocada")) inv.reload(); }}>Revocar</Btn> },
        ]} />}
      </Card>
    </>
  );
}
