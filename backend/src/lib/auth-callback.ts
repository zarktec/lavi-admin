/**
 * Página puente del inicio de sesión de Shopify. Shopify exige una URI de devolución `https://`,
 * pero la app móvil escucha su esquema propio: esta página recibe `?code=…&state=…` y los reenvía
 * a `<esquema>://auth/callback` con los mismos parámetros.
 * El destino es fijo (nunca se toma de la petición), así que no es una redirección abierta.
 */
export function appCallbackUrl(scheme: string, search: string): string {
  const query = search.startsWith("?") ? search : search ? `?${search}` : "";
  return `${scheme}://auth/callback${query}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function authCallbackHtml(target: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer">
<title>Volviendo a la app…</title>
<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:24px;text-align:center}
a{display:inline-block;margin-top:16px;padding:12px 20px;background:#6b4fbb;color:#fff;border-radius:999px;text-decoration:none}</style>
</head><body>
<h1>Volviendo a la app…</h1>
<p>Si no se abre sola, toca el botón.</p>
<a id="open" href="${esc(target)}">Abrir la app</a>
<script>location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")});</script>
</body></html>`;
}
