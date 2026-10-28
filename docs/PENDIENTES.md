# Pendientes

Marca con `[x]` a medida que se cierren. Orden sugerido: de arriba abajo.

## 1. Cambio de plan de Vercel (Hobby → Pro)
Hoy el proyecto corre en **Hobby**: un solo cron diario (`/cron/all`, 08:00 UTC) en lugar de las 5 tareas frecuentes. Mientras tanto **las dosis se cierran, y el push de respaldo se envía, una vez al día** (con un desfase de hasta 1 h), lo que sirve para probar pero no para producción. Hobby tampoco permite uso comercial.

Al pasar a Pro:
- [ ] Subir el equipo ZarK a **Pro** (Vercel → Settings → Billing).
- [ ] Restaurar los crons: `cp backend/vercel.pro.json backend/vercel.json` (5 tareas: cierre y push cada 10 min, vencimientos diarios, conciliación cada 15 min), eliminar `backend/vercel.pro.json` y hacer push.
- [ ] Opcional: borrar `backend/src/app/cron/all/route.ts` (solo existe por Hobby).
- [ ] Verificar en Vercel → Settings → Cron Jobs que aparecen las 5 tareas, y que `/cron/close-doses` responde 200 con `CRON_SECRET`.
- [ ] Revisar `maxDuration` de las funciones y el límite de conexiones de Neon (`pg` usa `max: 5` por instancia).
- [ ] Activar protecciones de producción: Vercel Firewall / rate limiting para `/v1/*` y `/v1/admin/auth/*`, y alertas de errores.

## 2. Despliegue y base de datos
- [x] Proyecto `lavi-admin` creado y conectado a `zarktec/lavi-admin` (raíz `backend`).
- [x] `DATABASE_URL` (Neon) cargada. `JWT_SECRET`, `APP_ENCRYPTION_KEY`, `CRON_SECRET`, `NFC_MASTER_KEYS`, `ADMIN_IDLE_MINUTES` cargadas.
- [ ] Ejecutar migraciones en Neon (usar la conexión **sin pool**, `DATABASE_URL_UNPOOLED`): `DATABASE_URL=<unpooled> npm run migrate --prefix backend`.
- [ ] Cargar ajustes iniciales y crear el superadministrador: `SUPERADMIN_EMAIL=… ADMIN_BASE_URL=https://<dominio> npm run seed --prefix backend` (imprime el enlace de alta; vence en 24 h).
- [ ] Ajustar en el panel **todos los valores iniciales** (los de `seed/settings.seed.json` son ejemplos): valor del punto, vencimientos, mínimo para redimir, textos de notificaciones, versión mínima de la app, etc.
- [ ] Guardar `NFC_MASTER_KEYS` en un gestor de contraseñas (Vercel no permite leerla de vuelta) y considerar **rotarla**: se compartió en una conversación.
- [ ] Definir variables faltantes: `APP_DOMAIN`, `APP_BASE_URL`, `ADMIN_BASE_URL`, `ADMIN_SESSION_HOURS`, `ADMIN_INVITE_HOURS`, `TOTP_ISSUER`.
- [ ] Dominio definitivo (reemplaza el marcador `app.tumarca.com`) apuntado al proyecto; HTTPS activo.
- [ ] Revisar y quitar variables sobrantes de la integración Neon que no usa el backend (`VITE_NEON_AUTH_URL`, `NEON_AUTH_BASE_URL`, `POSTGRES_*`, `PG*`).
- [ ] Backups/PITR de Neon activados y probada una restauración.

## 3. Shopify
- [ ] Habilitar **nuevas cuentas de cliente** en la tienda (requisito de la Customer Account API).
- [ ] Crear en Shopify el **cliente público móvil** de la Customer Account API: redirect `tumarca://auth/callback`, anotar `EXPO_PUBLIC_SHOPIFY_CLIENT_ID` y el `SHOP_ID`.
- [ ] Crear la **app privada** en el Dev Dashboard con permiso de gestión de descuentos (`write_discounts`) y de lectura de pedidos/clientes; cargar `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_API_SECRET`, `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_SHOP_ID`, `SHOPIFY_API_VERSION`.
- [ ] Crear el token de la **Storefront API** para la app (`EXPO_PUBLIC_STOREFRONT_TOKEN`).
- [ ] Registrar webhooks apuntando al backend: `orders/paid` → `/webhooks/shopify/orders-paid`, `refunds/create` → `/webhooks/shopify/refunds-create`, `customers/update` → `/webhooks/shopify/customers-update`.
- [ ] Cargar el catálogo en el panel y **vincular cada presentación** con su `shopify_variant_id`; publicar la primera versión de configuración de cada una.
- [ ] Probar de punta a punta con un pedido real de prueba: compra → activación → canje → código aplicado en el carrito → webhook marca el código como usado → devolución bloquea el tag.
- [ ] **Pasarela de pago en Colombia** (Shopify Payments no opera): elegir (Mercado Pago, PayU, Wompi, ePayco…), validar comisión total por transacción y probar el checkout.
- [ ] Verificar que los códigos de canje se pueden combinar (o no) con otras promociones según cada opción.
- [ ] Probar la prueba de la comisión adicional de Shopify por pasarela externa y el efecto en los precios.

## 4. Tags NFC
- [ ] Elegir **proveedor de tags NTAG 424 DNA**, costo por unidad y proceso de programación (o programar internamente).
- [ ] Definir con el proveedor el perfil SDM (ver `docs/NFC.md`) y si programa con llaves derivadas por tag (`npm run derive-tag-keys`) sin conservar la maestra.
- [ ] Probar con 5–10 tags reales: lectura, replay (mismo enlace), copia de URL, tag no importado, lote bloqueado.
- [ ] Decidir ubicación del tag en el frasco (no solo en la caja) y probar lectura sobre el envase real (metal, tapa).
- [ ] Importar el primer lote desde el panel (Tags y lotes).

## 5. App móvil
- [ ] Cuentas **Apple Developer** y **Google Play Console**; identificadores definitivos (`com.tumarca.app`).
- [ ] Configurar EAS (`eas login`, `eas build:configure`), perfiles `development/preview/production` y variables `EXPO_PUBLIC_*` (ver `mobile/README.md`).
- [ ] Servir los archivos de verificación de enlaces con valores reales: `IOS_APP_ID` (TeamID.bundle) y `ANDROID_SHA256_FINGERPRINTS` (firma de Play); probar Universal Links / App Links con un tag real.
- [ ] Probar en teléfonos reales (iOS y Android, incluso gama baja): NFC en primer plano y por enlace, login con Shopify, Checkout Kit, recordatorios locales, push de respaldo, modo sin conexión.
- [ ] Íconos, splash, capturas y textos de las tiendas; revisión de las políticas de Apple (eliminación de cuenta ya implementada) y Google (seguridad de datos).
- [ ] Reemplazar el texto de privacidad borrador (`mobile/app/privacy.tsx`).
- [ ] Pantalla de teléfono sin NFC y guía de activación en Android: revisar redacción y probar en un dispositivo sin NFC.
- [ ] Publicar versión inicial y subir `min_app_version` en el panel cuando haya una versión obligatoria.

## 6. Correo y notificaciones
- [ ] Elegir servicio de correo transaccional (Resend o Postmark), verificar el dominio (SPF/DKIM/DMARC) y cargar `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`.
- [ ] Probar invitación, recuperación de contraseña y reinicio de 2FA.
- [ ] Revisar textos de notificaciones en Ajustes globales.

## 7. Legal y regulatorio (Colombia)
- [ ] Política de tratamiento de datos y autorización explícita (Ley 1581 de 2012); registro de bases de datos si aplica.
- [ ] **Notificación Sanitaria Obligatoria INVIMA** del producto como cosmético.
- [ ] Respaldo de las afirmaciones de "crecimiento" en la app y la tienda (publicidad no engañosa).
- [ ] Indicar en la página del producto y en la política de devoluciones que se requiere un celular con NFC.
- [ ] Términos del programa de puntos (vigencia, redención, vencimiento, cambios).
- [ ] Revisión por asesoría legal de todo lo anterior.

## 8. Calidad y seguridad (recomendado antes del lanzamiento)
- [ ] **Rate limiting** en rutas públicas (`/v1/scans`, `/v1/auth/*`, `/v1/admin/auth/*`) con Vercel Firewall.
- [ ] Impedir reutilizar un código TOTP dentro de su ventana (guardar el último paso usado).
- [ ] Probar manualmente las acciones de escritura del panel (importar lote, publicar versión, ajustes, roles); hoy solo hay pruebas automáticas del backend y una prueba de humo de carga de pantallas.
- [ ] Pruebas de extremo a extremo con un dispositivo real y datos de prueba; prueba de carga básica de `POST /v1/scans`.
- [ ] Monitoreo: alertas de errores 5xx, del cron y de cola de canjes con problemas; revisar logs de Vercel.
- [ ] Revisar el pasivo de puntos y el costo máximo por tratamiento (simulador del catálogo) antes de fijar los valores del programa.
- [ ] Configurar CI en GitHub (ya hay `.github/workflows/ci.yml` para el backend) y agregar pruebas de la app móvil.
- [ ] Definir proceso de soporte: quién usa el rol "Servicio al cliente", límites de ajuste manual y umbral de aprobación.
- [ ] Plan de rotación de llaves (`NFC_MASTER_KEYS` v2, `JWT_SECRET`, `APP_ENCRYPTION_KEY`).
