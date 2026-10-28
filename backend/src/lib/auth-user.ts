import { SignJWT, jwtVerify } from "jose";
import { db, type Db } from "./db";
import { randomToken, sha256 } from "./crypto";
import { env } from "./env";
import { ApiError, forbidden, unauthorized } from "./errors";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 60;

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  timezone: string;
  shopify_customer_id: string;
}

const secret = () => new TextEncoder().encode(env("JWT_SECRET"));

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret());
}

/** Token de activación de un frasco: lo emite POST /scans y lo consume POST /treatments. */
export async function signActivationToken(
  claims: { tagUid: string; userId: string; scanId: string },
  minutes: number,
): Promise<string> {
  return new SignJWT({ typ: "activation", tag: claims.tagUid, scan: claims.scanId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${minutes}m`)
    .sign(secret());
}

export async function verifyActivationToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.typ !== "activation") throw new Error("typ");
    return { tagUid: payload.tag as string, userId: payload.sub as string, scanId: payload.scan as string };
  } catch {
    throw new ApiError(400, "activation_token_invalid", "El token de activación venció o no es válido");
  }
}

export async function issueSession(userId: string, t: Db = db) {
  const refresh = randomToken(48);
  await t.exec(
    `insert into refresh_tokens (user_id, token_hash, expires_at)
     values ($1, $2, now() + ($3 || ' days')::interval)`,
    [userId, sha256(refresh), String(REFRESH_TTL_DAYS)],
  );
  return {
    access_token: await signAccessToken(userId),
    refresh_token: refresh,
    expires_in: ACCESS_TTL_SECONDS,
  };
}

/** Rota el token de renovación: el anterior queda revocado. */
export async function refreshSession(refreshToken: string, t: Db = db) {
  const row = await t.one<{ id: string; user_id: string }>(
    `update refresh_tokens set revoked_at = now()
      where token_hash = $1 and revoked_at is null and expires_at > now()
      returning id, user_id`,
    [sha256(refreshToken)],
  );
  if (!row) throw unauthorized("invalid_refresh_token", "Vuelve a iniciar sesión");
  const user = await t.one("select status from users where id = $1", [row.user_id]);
  if (!user || user.status !== "active") throw unauthorized("account_unavailable", "La cuenta no está disponible");
  return issueSession(row.user_id, t);
}

export async function revokeRefreshToken(refreshToken: string) {
  await db.exec("update refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null", [
    sha256(refreshToken),
  ]);
}

export async function requireUser(req: Request): Promise<AuthUser> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw unauthorized();
  let sub: string;
  try {
    const { payload } = await jwtVerify(header.slice(7), secret(), { algorithms: ["HS256"] });
    if (payload.typ !== "access" || !payload.sub) throw new Error("typ");
    sub = payload.sub;
  } catch {
    throw unauthorized("token_expired", "Sesión vencida");
  }
  const user = await db.one<AuthUser & { status: string }>(
    "select id, email, name, timezone, shopify_customer_id, status from users where id = $1",
    [sub],
  );
  if (!user) throw unauthorized();
  if (user.status !== "active") throw forbidden("account_blocked", "Tu cuenta no está activa");
  return user;
}
