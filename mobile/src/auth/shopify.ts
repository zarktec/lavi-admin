import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { config } from "../config";

WebBrowser.maybeCompleteAuthSession();

export class LoginCancelled extends Error {}

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
}

let discoveryCache: Discovery | null = null;

async function discover(): Promise<Discovery> {
  if (discoveryCache) return discoveryCache;
  if (!config.shopId || !config.clientId) throw new Error("Falta configurar EXPO_PUBLIC_SHOPIFY_SHOP_ID y EXPO_PUBLIC_SHOPIFY_CLIENT_ID");
  const res = await fetch(`https://shopify.com/authentication/${config.shopId}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error("No se pudo contactar a Shopify");
  discoveryCache = (await res.json()) as Discovery;
  return discoveryCache;
}

export const redirectUri = () => AuthSession.makeRedirectUri({ scheme: config.authScheme, path: "auth/callback" });

/**
 * OAuth 2.0 con PKCE contra la Customer Account API (acceso sin contraseña: Shopify envía un código por correo).
 * Devuelve el access token que el backend valida en POST /v1/auth/session.
 */
export async function loginWithShopify(): Promise<string> {
  const d = await discover();
  const request = new AuthSession.AuthRequest({
    clientId: config.clientId,
    scopes: ["openid", "email", "customer-account-api:full"],
    redirectUri: redirectUri(),
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { nonce: Crypto.randomUUID() },
  });
  const result = await request.promptAsync({ authorizationEndpoint: d.authorization_endpoint });
  if (result.type !== "success") {
    if (result.type === "error") throw new Error(result.error?.message ?? "No se pudo iniciar sesión");
    throw new LoginCancelled();
  }
  const token = await AuthSession.exchangeCodeAsync(
    { clientId: config.clientId, code: result.params.code, redirectUri: redirectUri(), extraParams: { code_verifier: request.codeVerifier! } },
    { tokenEndpoint: d.token_endpoint },
  );
  return token.accessToken;
}
