# Despliegue en Vercel

Proyecto: **lavi-admin** (equipo ZarK), conectado a `zarktec/lavi-admin`, directorio raíz `backend`, plan **Hobby** por ahora (un cron diario `/cron/all`). Al pasar a Pro ver `docs/PENDIENTES.md`.

## Variables ya cargadas
`JWT_SECRET`, `APP_ENCRYPTION_KEY`, `CRON_SECRET` (sensibles, generadas al azar) y `ADMIN_IDLE_MINUTES`.

## Variables que faltan (Settings → Environment Variables)
| Variable | Origen |
| --- | --- |
| `DATABASE_URL` | Postgres de Neon o Supabase (Marketplace de Vercel → Storage) |
| `NFC_MASTER_KEYS` | Llave maestra de los tags (`v1:<32 hex>`). **Guárdala fuera de Vercel**: al ser sensible no se puede leer de vuelta |
| `APP_DOMAIN`, `APP_BASE_URL`, `ADMIN_BASE_URL` | Dominio definitivo de la app |
| `IOS_APP_ID`, `ANDROID_PACKAGE`, `ANDROID_SHA256_FINGERPRINTS`, `IOS_STORE_URL`, `ANDROID_STORE_URL` | Apps publicadas |
| `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_SHOP_ID`, `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_API_SECRET`, `SHOPIFY_API_VERSION` | Shopify |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | Resend o Postmark |

## Primer arranque (automático en cada build)
El comando de build del proyecto es `npm run migrate && npm run seed && next build`:
- `migrate` aplica las migraciones que falten (usa `DATABASE_URL_UNPOOLED` si existe).
- `seed` carga los ajustes iniciales que falten (no pisa los que cambies en el panel) y, si existe la variable `SUPERADMIN_EMAIL` y aún no hay superadministrador, crea su invitación e **imprime el enlace en el log del build** (vence en 24 h). Después de usarlo, borra `SUPERADMIN_EMAIL`.

Registra en Shopify los webhooks `orders/paid`, `refunds/create` y `customers/update` apuntando a `/webhooks/shopify/*`.
