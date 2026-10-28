import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import { db, type Db } from "./db";
import { decryptSecret, encryptSecret, randomToken, sha256 } from "./crypto";
import { envInt, envOpt } from "./env";
import { ApiError, forbidden, unauthorized } from "./errors";
import { getCookie, handle, type Ctx } from "./http";

export const COOKIE = "admin_session";
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export interface AdminCtx {
  admin: { id: string; email: string; name: string; status: string; role_id: string; role_name: string; is_superadmin: boolean; max_adjustment: number | null };
  permissions: Set<string>;
  sessionId: string;
  mfaVerified: boolean;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
// Compara contra un hash de relleno para igualar tiempos cuando el correo no existe
let dummyHash: string | undefined;
export async function dummyCompare(pw: string) {
  dummyHash ??= await bcrypt.hash("relleno-de-tiempo", 12);
  await bcrypt.compare(pw, dummyHash);
}

export function assertStrongPassword(pw: string) {
  if (pw.length < 12) throw new ApiError(400, "weak_password", "La contraseña debe tener al menos 12 caracteres");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new ApiError(400, "weak_password", "La contraseña debe combinar letras y números");
}

// ───── TOTP ─────
export function newTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

const totp = (base32: string, label = "admin") =>
  new OTPAuth.TOTP({ issuer: envOpt("TOTP_ISSUER", "Panel"), label, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(base32) });

export const otpauthUri = (base32: string, label: string) => totp(base32, label).toString();
export const verifyTotp = (encrypted: string, code: string) => totp(decryptSecret(encrypted)).validate({ token: code.replace(/\s/g, ""), window: 1 }) !== null;
export const currentTotp = (base32: string) => totp(base32).generate(); // para pruebas
export const encryptTotp = encryptSecret;

// ───── Sesiones ─────
export async function createSession(adminId: string, t: Db = db) {
  const token = randomToken(32);
  const hours = envInt("ADMIN_SESSION_HOURS", 12);
  await t.exec(
    "insert into admin_sessions (admin_user_id, token_hash, expires_at) values ($1, $2, now() + ($3 || ' hours')::interval)",
    [adminId, sha256(token), String(hours)],
  );
  return token;
}

export function sessionCookie(token: string, maxAgeSeconds = envInt("ADMIN_SESSION_HOURS", 12) * 3600): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}
export const clearCookie = () => sessionCookie("", 0);

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // clientes no navegador; la cookie es SameSite=Strict
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function loadAdmin(req: Request, opts: { allowPendingMfa?: boolean } = {}): Promise<AdminCtx> {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !sameOrigin(req)) throw forbidden("bad_origin", "Origen no permitido");
  const token = getCookie(req, COOKIE);
  if (!token) throw unauthorized();
  const idle = envInt("ADMIN_IDLE_MINUTES", 30);
  const s = await db.one<any>(
    `select s.id as session_id, s.mfa_verified, s.last_seen_at,
            a.id, a.email, a.name, a.status, a.role_id, r.name as role_name, r.is_superadmin, r.max_adjustment
       from admin_sessions s join admin_users a on a.id = s.admin_user_id join roles r on r.id = a.role_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
        and s.last_seen_at > now() - ($2 || ' minutes')::interval`,
    [sha256(token), String(idle)],
  );
  if (!s || s.status === "disabled") throw unauthorized("session_expired", "Tu sesión venció; vuelve a ingresar");
  if (!s.mfa_verified && !opts.allowPendingMfa) throw unauthorized("mfa_required", "Falta la verificación en dos pasos");
  if (Date.now() - new Date(s.last_seen_at).getTime() > 60_000) {
    await db.exec("update admin_sessions set last_seen_at = now() where id = $1", [s.session_id]);
  }
  const perms = s.is_superadmin
    ? await db.many<{ code: string }>("select code from permissions")
    : await db.many<{ code: string }>("select permission_code as code from role_permissions where role_id = $1", [s.role_id]);
  return {
    admin: { id: s.id, email: s.email, name: s.name, status: s.status, role_id: s.role_id, role_name: s.role_name, is_superadmin: s.is_superadmin, max_adjustment: s.max_adjustment },
    permissions: new Set(perms.map((p) => p.code)),
    sessionId: s.session_id,
    mfaVerified: s.mfa_verified,
  };
}

type Guard = string | "superadmin" | null;

/** Ruta de administración: exige sesión con verificación en dos pasos y el permiso indicado. */
export function adminHandle<P extends Record<string, string> = Record<string, string>>(
  guard: Guard,
  fn: (req: Request, params: P, a: AdminCtx) => Promise<Response>,
) {
  return handle<P>(async (req, params) => {
    const a = await loadAdmin(req);
    if (guard === "superadmin" && !a.admin.is_superadmin) throw forbidden("superadmin_required", "Solo el superadministrador puede hacer esto");
    if (guard && guard !== "superadmin" && !a.permissions.has(guard)) throw forbidden("forbidden", "Tu rol no tiene permiso para esto");
    return fn(req, params, a);
  });
}

export type { Ctx };
