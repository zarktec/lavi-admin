# App de adherencia NFC y programa de puntos

Implementación de la *Especificación técnica: app de adherencia NFC y programa de puntos* (28 oct 2026).

La clienta aplica el producto a la hora correcta, verifica cada aplicación acercando el teléfono a un tag NFC (NTAG 424 DNA) pegado al frasco, y recibe puntos redimibles en la tienda Shopify.

| Carpeta | Qué es |
| --- | --- |
| [`backend/`](backend) | Next.js + TypeScript para Vercel: API REST `/v1`, webhooks de Shopify, Vercel Cron, **panel administrativo** (`/admin`) y PostgreSQL. **Aquí vive toda regla de negocio.** |
| [`mobile/`](mobile) | App React Native (Expo) para iOS y Android: lee el tag, muestra, recuerda y compra. Nunca decide si una dosis cuenta ni cuántos puntos da. |
| [`docs/`](docs) | Decisiones de implementación, tags NFC, API y puesta en marcha. |

## Arranque rápido (desarrollo)

```bash
# 1. Base de datos local
createdb lavi && export DATABASE_URL=postgres://localhost/lavi

# 2. Backend
cd backend
cp .env.example .env         # completa JWT_SECRET, APP_ENCRYPTION_KEY, CRON_SECRET, NFC_MASTER_KEYS…
npm install
npm run migrate              # crea el esquema
SUPERADMIN_EMAIL=tu@correo.com npm run seed   # ajustes iniciales + enlace de alta del superadministrador
npm run dev                  # http://localhost:3000  (panel en /admin)
npm test                     # pruebas de integración contra Postgres (TEST_DATABASE_URL)
```

**Contrato de la API de la app (OpenAPI):** [`docs/openapi.json`](docs/openapi.json), también servido en `GET /v1/openapi.json`.
La fuente es `backend/src/lib/openapi.ts`; tras cambiar una ruta de app en `backend/src/app/v1` (excepto `admin`) edítala y ejecuta
`npm run openapi:export --prefix backend`. La prueba `tests/openapi.test.ts` falla si falta una ruta o si el JSON exportado está desactualizado.
La app móvil ([`lavi-app`](https://github.com/zarktec/lavi-app)) genera sus tipos desde ese archivo.

La app móvil se describe en [`mobile/README.md`](mobile/README.md) (requiere *development build*; NFC no funciona en Expo Go).

## Cómo se cubre la especificación

* **Cuatro controles por lectura** (`POST /v1/scans`): firma/contador → tag reclamado → es de esta clienta → ventana abierta. Se detiene en el primero que falla y toda lectura queda en `SCANS`. → `backend/src/lib/scans.ts`
* **Tags NTAG 424 DNA con SUN**: verificación AES-CMAC, descifrado del UID y contador, rechazo de copias y repeticiones. → `backend/src/lib/ntag.ts`, [`docs/NFC.md`](docs/NFC.md)
* **Todo parametrizable desde el panel**: configuraciones versionadas e inmutables (trigger en la base), ajustes globales en `SETTINGS`, sin valores de negocio en el código.
* **Libro de puntos inmutable** (trigger) con saldo = suma, índice único por hecho (una dosis da puntos una sola vez), vencimiento FIFO, ajustes manuales con aprobación.
* **Canjes**: descuenta y crea código de un solo uso restringido a la clienta en Shopify; idempotente (`Idempotency-Key`), reversa si Shopify falla y conciliación por cron.
* **Panel** con usuarios y roles propios, alta por invitación, TOTP obligatorio, bloqueo por intentos, sesiones con inactividad, último superadministrador protegido y bitácora de acciones.
* **Cron** (`vercel.json`): cierre de dosis, push de respaldo, vencimiento de puntos y códigos, conciliación de canjes.

Más detalle y decisiones tomadas donde la especificación deja libertad: [`docs/IMPLEMENTACION.md`](docs/IMPLEMENTACION.md).
