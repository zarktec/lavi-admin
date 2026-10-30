"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { api, initials } from "../_lib/api";
import { Icon, Loading, type IconName } from "../_components/ui";

interface Me { admin: { id: string; email: string; name: string; role_name: string; is_superadmin: boolean; max_adjustment: number | null }; permissions: string[] }
const MeCtx = createContext<{ me: Me; can: (p: string) => boolean } | null>(null);
export const useMe = () => useContext(MeCtx)!;

type NavItem = { href: string; label: string; icon: IconName; perm?: string; superadmin?: boolean; any?: string[]; badge?: "adjustments" | "redemptions" };
const NAV: { group?: string; items: NavItem[] }[] = [
  { items: [{ href: "/admin", label: "Inicio", icon: "home", perm: "dashboard.view" }] },
  {
    group: "Operación",
    items: [
      { href: "/admin/customers", label: "Clientas", icon: "users", any: ["customers.view", "points.approve"], badge: "adjustments" },
      { href: "/admin/points", label: "Puntos y canjes", icon: "gift", perm: "redemptions.view", badge: "redemptions" },
      { href: "/admin/reports", label: "Reportes", icon: "chart", perm: "reports.view" },
    ],
  },
  {
    group: "Producto",
    items: [
      { href: "/admin/catalog", label: "Catálogo", icon: "package", perm: "catalog.view" },
      { href: "/admin/tags", label: "Tags y lotes", icon: "tag", perm: "tags.view" },
    ],
  },
  {
    group: "Administración",
    items: [
      { href: "/admin/settings", label: "Ajustes globales", icon: "sliders", perm: "settings.view" },
      { href: "/admin/team", label: "Equipo", icon: "shield", superadmin: true },
      { href: "/admin/audit", label: "Auditoría", icon: "log", perm: "audit.view" },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<{ adjustments: number; redemptions: number }>({ adjustments: 0, redemptions: 0 });

  useEffect(() => {
    api<Me>("/auth/me").then(setMe).catch((e) => setError(e.message));
  }, []);

  // Pendientes en el menú: se actualizan al cambiar de pantalla y cada minuto.
  const canDash = !!me && (me.admin.is_superadmin || me.permissions.includes("dashboard.view"));
  useEffect(() => {
    if (!canDash) return;
    let live = true;
    const load = () => api<any>("/dashboard", { noRedirect: true }).then((d) => live && setCounts({ adjustments: d.pending_adjustments ?? 0, redemptions: d.redemption_problems ?? 0 })).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => { live = false; clearInterval(id); };
  }, [canDash, path]);

  // Cierra el menú móvil al navegar o con Escape; el título de la pestaña sigue la pantalla.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const cur = NAV.flatMap((g) => g.items).filter((n) => (n.href === "/admin" ? path === "/admin" : path.startsWith(n.href))).sort((a, b) => b.href.length - a.href.length)[0];
    document.title = `${cur?.label ?? "Panel"} · Panel Lavi`;
  }, [path]);

  if (!me) return <main className="main" id="contenido"><Loading error={error} loading={!error} /></main>;
  const can = (p: string) => me.admin.is_superadmin || me.permissions.includes(p);
  const visible = (n: NavItem) => (n.superadmin ? me.admin.is_superadmin : n.any ? n.any.some(can) : can(n.perm!));
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.length);

  async function logout() {
    await api("/auth/logout", { method: "POST", noRedirect: true }).catch(() => {});
    router.push("/admin/login");
  }

  return (
    <MeCtx.Provider value={{ me, can }}>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <div className="shell">
        <div className="topbar">
          <button className="icon-btn" aria-label="Abrir menú" aria-expanded={open} aria-controls="menu-principal" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <div className="brand"><div className="logo" aria-hidden="true">L</div>Lavi</div>
        </div>
        <div className={`drawer-backdrop ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
        <nav id="menu-principal" className={`sidebar ${open ? "open" : ""}`} aria-label="Principal">
          <div className="brand"><div className="logo" aria-hidden="true">L</div><div>Lavi<small>Panel administrativo</small></div></div>
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.group && <div className="nav-group">{g.group}</div>}
              {g.items.map((n) => {
                const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
                const count = n.badge ? counts[n.badge] : 0;
                return (
                  <Link key={n.href} href={n.href} className="nav-link" aria-current={active ? "page" : undefined}>
                    <Icon name={n.icon} size={20} />
                    <span>{n.label}</span>
                    {count > 0 && <span className={`nav-badge ${n.badge === "redemptions" ? "bad" : ""}`} aria-label={`${count} pendientes`}>{count}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="user-card">
            <div className="avatar" aria-hidden="true">{initials(me.admin.name)}</div>
            <div className="who"><b title={me.admin.email}>{me.admin.name}</b><small>{me.admin.role_name}</small></div>
            <button className="icon-btn" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión"><Icon name="logout" size={18} /></button>
          </div>
        </nav>
        <main className="main" id="contenido" tabIndex={-1}>{children}</main>
      </div>
    </MeCtx.Provider>
  );
}
