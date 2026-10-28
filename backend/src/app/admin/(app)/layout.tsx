"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../_lib/api";
import { Loading } from "../_components/ui";

interface Me { admin: { id: string; email: string; name: string; role_name: string; is_superadmin: boolean; max_adjustment: number | null }; permissions: string[] }
const MeCtx = createContext<{ me: Me; can: (p: string) => boolean } | null>(null);
export const useMe = () => useContext(MeCtx)!;

const NAV: { href: string; label: string; perm?: string; superadmin?: boolean; any?: string[] }[] = [
  { href: "/admin", label: "Inicio", perm: "dashboard.view" },
  { href: "/admin/catalog", label: "Catálogo", perm: "catalog.view" },
  { href: "/admin/tags", label: "Tags y lotes", perm: "tags.view" },
  { href: "/admin/customers", label: "Clientas", any: ["customers.view", "points.approve"] },
  { href: "/admin/points", label: "Puntos y canjes", perm: "redemptions.view" },
  { href: "/admin/reports", label: "Reportes", perm: "reports.view" },
  { href: "/admin/settings", label: "Ajustes globales", perm: "settings.view" },
  { href: "/admin/team", label: "Equipo", superadmin: true },
  { href: "/admin/audit", label: "Auditoría", perm: "audit.view" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/auth/me").then(setMe).catch((e) => setError(e.message));
  }, []);

  if (!me) return <main className="main"><Loading error={error} loading={!error} /></main>;
  const can = (p: string) => me.admin.is_superadmin || me.permissions.includes(p);
  const items = NAV.filter((n) => (n.superadmin ? me.admin.is_superadmin : n.any ? n.any.some(can) : can(n.perm!)));

  async function logout() {
    await api("/auth/logout", { method: "POST", noRedirect: true }).catch(() => {});
    router.push("/admin/login");
  }

  return (
    <MeCtx.Provider value={{ me, can }}>
      <div className="shell">
        <nav className="sidebar" aria-label="Principal">
          <div className="brand">Panel</div>
          {items.map((n) => {
            const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
            return <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}>{n.label}</Link>;
          })}
          <div className="who">
            {me.admin.name}
            <small>{me.admin.role_name}</small>
            <button className="btn link" style={{ color: "#cfe0d8", padding: "6px 0" }} onClick={logout}>Cerrar sesión</button>
          </div>
        </nav>
        <main className="main">{children}</main>
      </div>
    </MeCtx.Provider>
  );
}
