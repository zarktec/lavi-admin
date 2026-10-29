# Decisiones de implementación

Donde la especificación deja libertad se tomó la decisión más simple y segura. Todo es ajustable.

## Lecturas (`POST /v1/scans`)
* **Orden de controles**: firma + contador → (plazo sin conexión) → tag bloqueado → reclamado → dueña → ventana. Se detiene en el primero que falla.
* **Idempotencia**: índice único `(tag_uid, counter)` sobre lecturas que consumieron contador. Reenviar la misma lectura por la misma usuaria devuelve la respuesta guardada (`idempotent_replay: true`); otra cuenta o un contador menor/igual al último → `rejected/replayed`.
* **Tag firmado pero no importado** responde `invalid_signature` (no se revela más).
* **Resultado de ventana** (hora del servidor):
  * ventana abierta → `dose_recorded`;
  * si no, la dosis más reciente ya cerrada sin lectura (mientras no abra la siguiente) → `late` sin puntos;
  * si la dosis en curso ya se cumplió y la siguiente no abre → `no_pending_dose`;
  * si no → `too_early` con la hora de apertura.
* **Sin conexión**: debe llegar dentro de `offline_scan_max_hours`, la hora del dispositivo no puede estar en el futuro más allá de la tolerancia y debe caer en una ventana ± `offline_device_time_tolerance_minutes`; si no, `rejected/offline_expired`. Si el cierre automático ya había penalizado esa dosis, se revierte la penalización.
* **Tardía**: si la dosis ya estaba perdida y `late_dose_avoids_penalty` está activo, se revierte la penalización.

## Tratamientos y dosis
* Al activar se generan todas las dosis de una vez (UTC, convertidas con la zona de la usuaria). Las ventanas del primer día que ya cerraron se omiten; opcionalmente se puede indicar `start_date` (hasta 7 días adelante).
* Cambio de horario: borra y regenera solo dosis `scheduled` que empiezan después de ahora + `schedule_change_min_notice_hours`; las demás conservan su horario y un día nunca supera `doses_per_day`. Límite por `schedule_change_max_count` en `schedule_change_period_days`. Los horarios no pueden solaparse entre sí (ventanas).
* Un frasco = un tratamiento (`treatments.tag_uid` único). `allow_parallel_treatments` controla varios activos.
* El tratamiento pasa a `finished` cuando ya no quedan dosis por resolver.

## Liberar un tag
* **Panel → Tags y lotes → Buscar tag → Liberar tag** (permiso `tags.release`; solo el superadministrador lo tiene por defecto, se puede asignar a otros roles). Exige un motivo de 5+ caracteres.
* Deja el tag **sin reclamar** (también si estaba bloqueado) y **borra el tratamiento** que lo reclamó con sus dosis y cambios de horario, porque `treatments.tag_uid` es único. Se conservan las lecturas (sin dosis asociada), el libro de puntos (la clienta se queda con lo ganado; si hace falta quitarlo, ajuste manual) y el contador del tag (anti-repetición).
* Quien lo active después —la misma clienta u otra— obtiene un tratamiento nuevo; los puntos de bienvenida, si la configuración los da, se vuelven a otorgar.
* Queda en la bitácora (`tag.release`) con un resumen de lo borrado. Un lote bloqueado sigue bloqueando sus tags.

## Puntos
* **Tope por frasco** (`max_points_per_treatment`) cuenta bienvenida + dosis + bonos de racha.
* **Racha** = dosis `on_time` consecutivas hasta la actual (una `late` o `missed` la corta). Reglas con `repeatable` pagan cada múltiplo.
* **Penalización**: la aplica el cron al cerrar; si `allow_negative_balance` es falso se acota al saldo.
* **Vencimiento** (`points_expiration_days`, 0 = no vencen): FIFO — los débitos consumen primero los abonos más antiguos; el remanente de un abono vencido se descuenta con un movimiento `expiration`.
* **Ajustes manuales**: motivo obligatorio; tope por rol (`roles.max_adjustment`); sobre `manual_adjustment_approval_threshold` quedan pendientes hasta que un superadministrador (o quien tenga `points.approve`, distinto de quien lo pidió) los aprueba; un superadministrador aplica directo.

## Canjes
* Con la usuaria bloqueada (`SELECT … FOR UPDATE`): valida saldo/mínimo, descuenta y crea el canje `pending`; **después** crea el descuento en Shopify (un uso, restringido a la clienta, con vencimiento, limitado al producto si aplica, combinable según la opción).
* Si Shopify falla: movimiento de reversa y canje `failed`; la misma `Idempotency-Key` devuelve el mismo resultado sin volver a cobrar. Canjes `pending` interrumpidos los completa o revierte `/cron/reconcile-redemptions`.
* Código vencido sin usar → `expired`; devuelve puntos si `refund_points_on_expired_code`.

## Integración con Shopify
* Inicio de sesión: la app obtiene el token (OAuth2 + PKCE, Customer Account API) y el backend consulta `customer` para crear/actualizar `USERS` por `shopify_customer_id`; compras como invitada se enlazan por correo.
* Al activar un frasco se vincula la compra pagada de esa presentación (`tags.shopify_order_id`); `refunds/create` bloquea los tags de ese pedido y cancela su tratamiento.
* Webhooks: HMAC (`X-Shopify-Hmac-Sha256`) y `WEBHOOK_EVENTS` para no procesar dos veces.

## Panel
* Sesión por cookie `HttpOnly; SameSite=Strict` con token aleatorio guardado como hash; verificación Origin en métodos no seguros; expira por inactividad (`ADMIN_IDLE_MINUTES`) y de forma absoluta (`ADMIN_SESSION_HOURS`).
* Contraseñas con bcrypt (coste 12), mínimo 12 caracteres con letras y números; 5 intentos fallidos → bloqueo de 15 min. El secreto TOTP se guarda cifrado (AES-256-GCM, `APP_ENCRYPTION_KEY`).
* Gestión de usuarios, roles e invitaciones es **exclusiva del superadministrador**; `team.manage` no es asignable a roles nuevos. Los usuarios se desactivan, no se borran.
* Los ajustes globales no tienen valores por defecto en código: faltantes → error `settings_missing`. `npm run seed` carga valores iniciales de `backend/seed/settings.seed.json` (cámbialos en el panel antes del lanzamiento).

## Fuera de alcance / pendientes
* Rate limiting en las rutas públicas (recomendado: Vercel Firewall / WAF).
* No se impide reutilizar un mismo código TOTP dentro de su ventana de 30 s.
* Pendientes de negocio de la especificación: proveedor de tags y programación de llaves, pasarela de pago en Colombia, dominio definitivo (`app.tumarca.com` es un marcador), valores iniciales de parámetros, correo transaccional, habilitar nuevas cuentas de cliente en Shopify, revisión legal (Ley 1581, INVIMA, publicidad, política de devoluciones con requisito de NFC).
