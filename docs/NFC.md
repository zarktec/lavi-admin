# Tags NFC (NTAG 424 DNA) y verificación SUN

Cada frasco lleva un tag NTAG 424 DNA con **SUN** (Secure Unique NFC). En cada lectura el tag escribe la URL:

```
https://app.tumarca.com/t?d=<32 hex>&c=<16 hex>
```

* `d` = `AES-128-CBC(IV=0, llave SDMMetaRead)` de `C7 ‖ UID(7) ‖ contador(3, LSB primero) ‖ relleno`
* `c` = CMAC truncado (bytes de posición impar, 8 bytes) con la llave de sesión
  `CMAC(SDMFileReadKey, 3CC3 0001 0080 ‖ UID ‖ contador)`, sobre una entrada vacía.

El contador sube en cada lectura. El backend rechaza todo contador **igual o menor** al último registrado (`replayed`).
La app envía la URL completa sin interpretarla; solo el backend tiene las llaves.

## Gestión de llaves

* Las llaves son propiedad de la empresa. La **llave maestra** (16 bytes) vive solo en variables de entorno de Vercel / gestor de secretos: `NFC_MASTER_KEYS=v1:<hex>,v2:<hex>` (varias versiones permiten rotar).
* Diversificación (implementada en `src/lib/ntag.ts`):
  * `SDMMetaRead` = `CMAC(maestra, "SDM-META")` — común a la versión de llave, imprescindible para poder leer el UID antes de saber de qué tag se trata.
  * `SDMFileRead` = `CMAC(maestra, "SDM-MAC" ‖ UID)` — única por tag.
* `TAGS.key_ref` guarda la versión de llave maestra con la que se programó cada tag.

## Programación de tags

Configuración del archivo NDEF en el tag (perfil SDM):

| Parámetro | Valor |
| --- | --- |
| Plantilla NDEF | `https://app.tumarca.com/t?d=<32 ceros>&c=<16 ceros>` |
| SDM habilitado | UID y contador reflejados (cifrados con SDMMetaRead), MAC activado |
| `SDMMACInputOffset` | = `SDMMACOffset` (el MAC se calcula sobre entrada vacía) |
| Llaves | Meta = `SDMMetaRead`; File = `SDMFileRead` derivadas arriba; el resto, llaves de aplicación propias |

Para obtener las llaves de un tag a programar (o para entregar al fabricante sin que las conserve):

```bash
NFC_MASTER_KEYS=v1:<hex> npm run derive-tag-keys -- v1 04A1B2C3D4E5F6
```

El fabricante entrega un CSV `uid[,key_ref]`; se importa desde **Panel → Tags y lotes** (los tags quedan "sin reclamar" y atados a una presentación).

> **Pendiente (spec):** elegir proveedor de tags, costo por unidad y proceso de programación de llaves. Si el proveedor programa con un esquema de diversificación distinto, solo cambian `deriveMetaKey`/`deriveFileKey` en `src/lib/ntag.ts`.

## Universal Links / App Links

El backend sirve `/.well-known/apple-app-site-association` y `/.well-known/assetlinks.json` (variables `IOS_APP_ID`, `ANDROID_PACKAGE`, `ANDROID_SHA256_FINGERPRINTS`). Si la app no está instalada, `GET /t` detecta el sistema operativo y lleva a la tienda.

## Modo de pruebas con tags sin SUN (NTAG215)

Para probar el flujo con tags que no tienen SUN (p. ej. NTAG215), define `NFC_INSECURE_TEST_MODE=1`. Entonces el backend también acepta la URL fija

```
https://<dominio>/t?uid=048D34B22E6180
```

(UID de 14 hex en mayúsculas, sin dos puntos) y usa como contador los segundos desde 2026-01-01 de la hora de la lectura. **No hay firma: cualquiera que copie esa URL puede "leer" el tag.** Por seguridad nunca funciona si `VERCEL_ENV=production`, aunque la variable esté puesta. Define la variable solo en el entorno *Preview* y bórrala antes del lanzamiento.
