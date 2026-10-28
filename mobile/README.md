# App móvil (iOS y Android)

React Native + Expo (Expo Router, TypeScript). Lee el tag NFC del frasco, muestra el resultado que decide el backend y programa recordatorios locales. **Ninguna regla de negocio vive aquí**: la app envía el enlace del tag a `POST /v1/scans` y solo presenta el `result`.

## Instalación

```bash
cd mobile
npm install
cp .env.example .env   # y completa los valores
npm test               # pruebas de la lógica pura (cola offline, recordatorios, resultados, cliente API)
npm run typecheck
```

## Variables de entorno (`EXPO_PUBLIC_*`)

| Variable | Para qué |
|---|---|
| `EXPO_PUBLIC_API_URL` | URL del backend (por defecto `http://localhost:3000`). En un teléfono físico usa la IP de tu computador o un túnel (`https://…`), no `localhost`. |
| `EXPO_PUBLIC_APP_DOMAIN` | Dominio de los Universal Links / App Links (por defecto `app.tumarca.com`); debe coincidir con `APP_DOMAIN` del backend y con la URL escrita en los tags. |
| `EXPO_PUBLIC_SHOPIFY_SHOP_ID` | ID numérico de la tienda (endpoints OAuth de la Customer Account API). |
| `EXPO_PUBLIC_SHOPIFY_CLIENT_ID` | Client ID del cliente público móvil de la Customer Account API. |
| `EXPO_PUBLIC_SHOPIFY_STORE_DOMAIN` | `mitienda.myshopify.com` (Storefront API). |
| `EXPO_PUBLIC_STOREFRONT_TOKEN` | Token público de la Storefront API. |

Otras (solo build, en `app.config.ts`): `APP_NAME`, `APP_BUNDLE_ID` (identificador iOS y paquete Android), `EAS_PROJECT_ID`.
En `eas.json` cada perfil (`development`, `preview`, `production`) fija su `EXPO_PUBLIC_API_URL`; ajústalos.

## Probar NFC (requiere *development build*, no Expo Go)

`react-native-nfc-manager` es código nativo, así que Expo Go no sirve.

```bash
npx eas build --profile development --platform android   # o ios (requiere cuenta Apple Developer)
# o local, con el SDK nativo instalado:
npx expo run:android      # npx expo run:ios
npm start                 # servidor de desarrollo (dev client)
```

- Usa un teléfono físico con NFC. Los simuladores no leen tags.
- Para generar una URL firmada de prueba sin un tag real, usa `buildSunUrl` del backend (`backend/src/lib/ntag.ts`) y escríbela en un NTAG 424 DNA ya programado, o llama a `POST /v1/scans` desde el cliente HTTP.
- **iOS**: la lectura en primer plano usa la hoja del sistema. Además, al tocar un tag con la app instalada, iOS abre el Universal Link (requiere `/.well-known/apple-app-site-association` en el dominio y el entitlement *Associated Domains*).
- **Android**: la lectura en primer plano funciona con NFC encendido; la apertura por App Link requiere `/.well-known/assetlinks.json` con la huella SHA-256 del certificado de firma.

## Estructura

```
app/                 pantallas (Expo Router)
  (tabs)/            Inicio, Tratamientos, Puntos, Tienda, Perfil
  t.tsx              destino del Universal/App Link del tag (/t?d=…&c=…)
  scan.tsx           lectura NFC en primer plano + verificación de NFC
  scan-result.tsx    una pantalla por `result` del backend
  activate.tsx       activación del frasco (horarios editables)
  treatment/[id].tsx calendario de dosis y cambio de horarios
  redemptions.tsx    canje de puntos y códigos
  cart.tsx           carrito + Checkout Kit con el código aplicado
src/api/             cliente tipado (renovación de token, Idempotency-Key, errores)
src/auth/shopify.ts  OAuth 2.0 + PKCE con la Customer Account API
src/lib/             lógica pura y probada: queue (cola offline), reminders, results
src/notifications/   recordatorios locales, permisos y token push
src/nfc/             lectura del tag
src/store/           Storefront API
```

## Comportamiento clave

- **Sesión**: login Shopify (OAuth + PKCE, código por correo) → el access token de Shopify se envía a `POST /v1/auth/session` con zona horaria y consentimiento (Ley 1581, pantalla de autorización previa). Tokens propios en `expo-secure-store`; el access (15 min) se renueva solo con el refresh rotativo.
- **Sin conexión**: si no hay red, la app guarda `{tag_url, device_time}` en AsyncStorage y los reenvía **en orden** con `offline: true` al recuperar conexión (el contador del tag exige orden). No inventa resultados locales.
- **Recordatorios locales** (`expo-notifications`): al abrir cada ventana y las insistencias de `config.reminder_nudges`, con los textos de `notification_texts`. Se programan las próximas 60 en orden cronológico (límite de iOS) y se reprograman al abrir la app, tras cada lectura y al cambiar horarios. Al registrar una dosis se cancelan sus insistencias. El permiso se pide en contexto (al activar el primer frasco o desde Inicio/Perfil).
- **Actualización obligatoria**: `GET /v1/config/app` → si la versión de la app es menor a `min_app_version`, se muestra la pantalla de actualización.
- **Canjes**: `Idempotency-Key` por intento (se reutiliza si hubo corte de red, para no cobrar dos veces).
- **Compra**: Storefront API → `cartCreate` con los datos de la clienta y el código de canje → Checkout Kit.

## Pendientes de configuración externa

- Cliente público móvil de la Customer Account API (redirect URI `tumarca://auth/callback`; ajusta el esquema en `app.config.ts` y `src/config.ts`).
- Dominio real, `apple-app-site-association` / `assetlinks.json` (los sirve el backend) y firma de las apps.
- Íconos y *splash* (`app.config.ts` no define `icon`; Expo usa los predeterminados).
- Texto legal definitivo en `app/privacy.tsx` (hoy es un borrador).
- Publicación con EAS (`eas build` / `eas submit`) y cuenta Apple/Google.
