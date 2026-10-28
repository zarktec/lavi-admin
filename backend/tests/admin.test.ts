import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as acceptInvite } from "@/app/v1/admin/auth/accept-invite/route";
import { POST as login } from "@/app/v1/admin/auth/login/route";
import { POST as mfa } from "@/app/v1/admin/auth/mfa/route";
import { GET as me } from "@/app/v1/admin/auth/me/route";
import { POST as invitationsPOST } from "@/app/v1/admin/invitations/route";
import { PATCH as userPATCH } from "@/app/v1/admin/users/[id]/route";
import { POST as resetMfa } from "@/app/v1/admin/users/[id]/reset-mfa/route";
import { POST as rolesPOST } from "@/app/v1/admin/roles/route";
import { POST as productsPOST } from "@/app/v1/admin/products/route";
import { POST as variantsPOST } from "@/app/v1/admin/products/[id]/variants/route";
import { POST as configsPOST } from "@/app/v1/admin/variants/[id]/configs/route";
import { POST as batchesPOST } from "@/app/v1/admin/tag-batches/route";
import { GET as auditGET } from "@/app/v1/admin/audit/route";
import { POST as adjustPOST } from "@/app/v1/admin/customers/[id]/adjustments/route";
import { POST as decisionPOST } from "@/app/v1/admin/adjustments/[id]/decision/route";
import { PUT as settingsPUT } from "@/app/v1/admin/settings/route";
import { GET as dashboardGET } from "@/app/v1/admin/dashboard/route";
import { GET as fraudGET } from "@/app/v1/admin/reports/fraud/route";
import { GET as adherenceGET } from "@/app/v1/admin/reports/adherence/route";
import { GET as customersGET } from "@/app/v1/admin/customers/route";
import { currentTotp } from "@/lib/auth-admin";
import { randomToken, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { call, closePool, json, makeUser, realTime, resetDb } from "./helpers";

const PASSWORD = "Clave-Segura-2026";

async function invite(email: string, roleName: string) {
  const role = await db.one<{ id: string }>("select id from roles where name = $1", [roleName]);
  const token = randomToken(32);
  await db.exec("insert into invitations (email, name, role_id, token_hash, expires_at) values ($1, $1, $2, $3, now() + interval '1 hour')", [email, role!.id, sha256(token)]);
  return token;
}

/** Alta completa: invitación → contraseña → login → TOTP. Devuelve la cookie de sesión verificada. */
async function onboard(email: string, roleName: string) {
  const acc = await json(await call(acceptInvite, "POST", "/x", { body: { token: await invite(email, roleName), password: PASSWORD } }));
  expect(acc.status).toBe(201);
  return { ...(await signIn(email, acc.body.secret)), secret: acc.body.secret as string };
}

async function signIn(email: string, secret: string) {
  const res = await call(login, "POST", "/x", { body: { email, password: PASSWORD } });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const m = await json(await call(mfa, "POST", "/x", { cookie, body: { code: currentTotp(secret) } }));
  expect(m.status).toBe(200);
  const id = (await db.one<{ id: string }>("select id from admin_users where lower(email) = lower($1)", [email]))!.id;
  return { cookie, id };
}

beforeEach(async () => {
  realTime();
  await resetDb();
});
afterAll(closePool);

describe("acceso al panel", () => {
  it("invitación → contraseña → login → TOTP → sesión", async () => {
    const { cookie } = await onboard("root@example.com", "Superadministrador");
    const m = await json(await call(me, "GET", "/x", { cookie }));
    expect(m.body.admin).toMatchObject({ email: "root@example.com", is_superadmin: true, status: "active" });
    expect(m.body.permissions).toContain("team.manage");
  });

  it("sin verificación en dos pasos no hay acceso a rutas protegidas", async () => {
    await onboard("root@example.com", "Superadministrador");
    const res = await call(login, "POST", "/x", { body: { email: "root@example.com", password: PASSWORD } });
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    const m = await json(await call(me, "GET", "/x", { cookie }));
    expect(m.status).toBe(401);
    expect(m.body.error.code).toBe("mfa_required");
  });

  it("la invitación vence y solo se usa una vez; la contraseña debe ser fuerte", async () => {
    const token = await invite("a@example.com", "Analista");
    expect((await json(await call(acceptInvite, "POST", "/x", { body: { token, password: "corta1" } }))).body.error.code).toBe("weak_password");
    expect((await json(await call(acceptInvite, "POST", "/x", { body: { token, password: PASSWORD } }))).status).toBe(201);
    expect((await json(await call(acceptInvite, "POST", "/x", { body: { token, password: PASSWORD } }))).body.error.code).toBe("invitation_invalid");
    await db.exec("update invitations set accepted_at = null, expires_at = now() - interval '1 minute'");
    expect((await json(await call(acceptInvite, "POST", "/x", { body: { token, password: PASSWORD } }))).body.error.code).toBe("invitation_invalid");
  });

  it("bloquea temporalmente tras intentos fallidos", async () => {
    await onboard("root@example.com", "Superadministrador");
    for (let i = 0; i < 5; i++) {
      expect((await call(login, "POST", "/x", { body: { email: "root@example.com", password: "incorrecta-123" } })).status).toBe(401);
    }
    const locked = await call(login, "POST", "/x", { body: { email: "root@example.com", password: PASSWORD } });
    expect(locked.status).toBe(423);
  });

  it("la sesión vence por inactividad", async () => {
    const { cookie } = await onboard("root@example.com", "Superadministrador");
    await db.exec("update admin_sessions set last_seen_at = now() - interval '2 hours'");
    expect((await json(await call(me, "GET", "/x", { cookie }))).body.error.code).toBe("session_expired");
  });

  it("rechaza peticiones de otro origen", async () => {
    const { cookie } = await onboard("root@example.com", "Superadministrador");
    const r = await json(await call(rolesPOST, "POST", "/x", { cookie, headers: { origin: "https://evil.example", host: "localhost" }, body: { name: "X", permissions: [] } }));
    expect(r.body.error.code).toBe("bad_origin");
  });
});

describe("roles, permisos y equipo", () => {
  it("un rol sin permiso recibe 403; el superadministrador puede crear roles", async () => {
    const root = await onboard("root@example.com", "Superadministrador");
    const analyst = await onboard("ana@example.com", "Analista");
    expect((await json(await call(dashboardGET, "GET", "/x", { cookie: analyst.cookie }))).status).toBe(403);
    expect((await json(await call(adherenceGET, "GET", "/x", { cookie: analyst.cookie }))).status).toBe(200);
    expect((await json(await call(rolesPOST, "POST", "/x", { cookie: analyst.cookie, body: { name: "Hack", permissions: [] } }))).status).toBe(403);
    expect((await json(await call(invitationsPOST, "POST", "/x", { cookie: analyst.cookie, body: { email: "z@z.co", role_id: "00000000-0000-0000-0000-000000000000" } }))).status).toBe(403);

    const created = await json(await call(rolesPOST, "POST", "/x", { cookie: root.cookie, body: { name: "Marketing", permissions: ["reports.view", "dashboard.view"] } }));
    expect(created.status).toBe(201);
    const withTeam = await json(await call(rolesPOST, "POST", "/x", { cookie: root.cookie, body: { name: "Mala", permissions: ["team.manage"] } }));
    expect(withTeam.body.error.code).toBe("invalid_permission");
  });

  it("no se puede desactivar ni degradar al último superadministrador", async () => {
    const root = await onboard("root@example.com", "Superadministrador");
    const op = await db.one<{ id: string }>("select id from roles where name = 'Operaciones'");
    const off = await json(await call(userPATCH, "PATCH", "/x", { cookie: root.cookie, params: { id: root.id }, body: { status: "disabled" } }));
    expect(off.body.error.code).toBe("last_superadmin");
    const down = await json(await call(userPATCH, "PATCH", "/x", { cookie: root.cookie, params: { id: root.id }, body: { role_id: op!.id } }));
    expect(down.body.error.code).toBe("last_superadmin");
  });

  it("desactivar revoca la sesión; reiniciar el 2FA exige nuevo código", async () => {
    const root = await onboard("root@example.com", "Superadministrador");
    const op = await onboard("op@example.com", "Operaciones");
    expect((await json(await call(resetMfa, "POST", "/x", { cookie: op.cookie, params: { id: root.id } }))).status).toBe(403);
    await call(resetMfa, "POST", "/x", { cookie: root.cookie, params: { id: op.id } });
    expect((await json(await call(me, "GET", "/x", { cookie: op.cookie }))).status).toBe(401);
    const again = await call(login, "POST", "/x", { body: { email: "op@example.com", password: PASSWORD } });
    const body = await again.json();
    expect(body).toMatchObject({ mfa: "setup" });
    expect(body.otpauth_uri).toMatch(/^otpauth:\/\/totp\//);

    await call(userPATCH, "PATCH", "/x", { cookie: root.cookie, params: { id: op.id }, body: { status: "disabled" } });
    expect((await call(login, "POST", "/x", { body: { email: "op@example.com", password: PASSWORD } })).status).toBe(401);
  });
});

describe("catálogo, lotes y bitácora", () => {
  it("publica configuraciones versionadas, importa lotes y deja todo en la bitácora", async () => {
    const root = await onboard("root@example.com", "Superadministrador");
    const p = await json(await call(productsPOST, "POST", "/x", { cookie: root.cookie, body: { name: "Tónico" } }));
    const v = await json(await call(variantsPOST, "POST", "/x", { cookie: root.cookie, params: { id: p.body.id }, body: { name: "100 ml", sku: "T-100", volume_ml: 100, shopify_variant_id: "555" } }));
    const cfg = {
      doses_per_day: 1, default_reminder_times: ["08:00"], window_minutes_before: 60, window_minutes_after: 60, duration_days: 30, points_per_dose: 10,
      streak_rules: [{ streak_length: 7, bonus_points: 20, repeatable: true }],
    };
    const c1 = await json(await call(configsPOST, "POST", "/x", { cookie: root.cookie, params: { id: v.body.id }, body: cfg }));
    const c2 = await json(await call(configsPOST, "POST", "/x", { cookie: root.cookie, params: { id: v.body.id }, body: { ...cfg, points_per_dose: 12 } }));
    expect([c1.body.version, c2.body.version]).toEqual([1, 2]);
    expect((await db.one("select points_per_dose from variant_configs where version = 1"))!.points_per_dose).toBe(10); // la anterior no cambia

    const bad = await json(await call(configsPOST, "POST", "/x", { cookie: root.cookie, params: { id: v.body.id }, body: { ...cfg, default_reminder_times: ["08:00", "20:00"] } }));
    expect(bad.status).toBe(400);

    const csv = "uid,key_ref\n04A1B2C3D4E5F6,v1\n04A1B2C3D4E5F7\n04A1B2C3D4E5F6\n";
    const batch = await json(await call(batchesPOST, "POST", "/x", { cookie: root.cookie, body: { variant_id: v.body.id, batch_code: "L-001", csv } }));
    expect(batch.body).toMatchObject({ received: 3, imported: 2, duplicates_in_file: 1 });
    const badUid = await json(await call(batchesPOST, "POST", "/x", { cookie: root.cookie, body: { variant_id: v.body.id, batch_code: "L-002", csv: "XYZ" } }));
    expect(badUid.body.error.code).toBe("invalid_uid");

    const log = await json(await call(auditGET, "GET", "/v1/admin/audit?limit=50", { cookie: root.cookie }));
    const actions = log.body.entries.map((e: any) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["product.create", "variant.create", "config.publish", "tag_batch.import"]));
  });
});

describe("ajustes manuales de puntos", () => {
  it("respeta el tope del rol y exige aprobación sobre el umbral", async () => {
    const root = await onboard("root@example.com", "Superadministrador");
    const cs = await onboard("cs@example.com", "Servicio al cliente"); // tope del rol: 500
    const ana = await makeUser();
    const adj = async (who: { cookie: string }, amount: number, reason = "Compensación por falla") => json(await call(adjustPOST, "POST", "/x", { cookie: who.cookie, params: { id: ana.id }, body: { amount, reason } }));
    const balance = async () => Number((await db.one("select coalesce(sum(amount),0) as b from points_ledger"))!.b);

    expect((await adj(cs, 100)).body.status).toBe("applied");
    expect(await balance()).toBe(100);
    expect((await adj(cs, 600)).body.error.code).toBe("above_role_limit");

    await db.exec("update roles set max_adjustment = 5000 where name = 'Servicio al cliente'");
    const pending = await adj(cs, 1500); // sobre el umbral de 1000
    expect(pending.body.status).toBe("pending_approval");
    expect(await balance()).toBe(100);
    // quien lo pidió no lo aprueba; un superadministrador sí
    expect((await json(await call(decisionPOST, "POST", "/x", { cookie: cs.cookie, params: { id: pending.body.id }, body: { approve: true } }))).status).toBe(403);
    const dec = await json(await call(decisionPOST, "POST", "/x", { cookie: root.cookie, params: { id: pending.body.id }, body: { approve: true } }));
    expect(dec.body.status).toBe("applied");
    expect(await balance()).toBe(1600);
    expect((await json(await call(decisionPOST, "POST", "/x", { cookie: root.cookie, params: { id: pending.body.id }, body: { approve: true } }))).body.error.code).toBe("already_decided");

    // el superadministrador aplica directo, y restar más del saldo se rechaza
    expect((await adj(root, 2000)).body.status).toBe("applied");
    expect((await adj(root, -99999)).body.error.code).toBe("negative_balance");
    expect((await adj(cs, 10, "x")).status).toBe(400); // motivo obligatorio
  });
});

describe("ajustes globales y reportes", () => {
  it("valida y registra los cambios de ajustes; búsqueda de clientas y reportes responden", async () => {
    const root = await onboard("root@example.com", "Superadministrador");
    const bad = await json(await call(settingsPUT, "PUT", "/x", { cookie: root.cookie, body: { min_app_version: "uno" } }));
    expect(bad.status).toBe(400);
    const good = await json(await call(settingsPUT, "PUT", "/x", { cookie: root.cookie, body: { point_value_cop: 75 } }));
    expect(good.status).toBe(200);
    expect(good.body.settings.point_value_cop).toBe(75);
    expect(await db.one("select action from audit_log where action = 'settings.update'")).not.toBeNull();
    const v = await db.one("select value from settings where key = 'point_value_cop'");
    expect(v!.value).toBe(75);

    await makeUser("busqueda@example.com");
    const found = await json(await call(customersGET, "GET", "/v1/admin/customers?q=busqueda", { cookie: root.cookie }));
    expect(found.body.customers).toHaveLength(1);
    expect((await json(await call(fraudGET, "GET", "/x", { cookie: root.cookie }))).status).toBe(200);
  });
});
