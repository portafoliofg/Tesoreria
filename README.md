# Tesorería

Lector de comprobantes y tesorería: una web app de Google Apps Script vinculada a una planilla de Google Sheets.

## Estructura

```
src/
  Código.gs        Código del servidor (Apps Script)
  Index.html       Interfaz (HTML, CSS y JS)
  appsscript.json  Manifiesto del proyecto
docs/
  index.html       Página de bgpsammar.com: video de presentación, ingreso, selector y la app en un iframe
  sesion.js        Ingreso único (usuarios de Tesorería) compartido por las páginas
  propiedades.html Sección Propiedades (por ahora con datos de ejemplo)
  carga.*, marca.png, logo-as-*.png  Video de presentación, logo y favicons (Andrés Sammartino)
  CNAME            Dominio propio para GitHub Pages
.clasp.json.example
```

## Publicación automática desde GitHub

Cada cambio en `src/` que llega a `main` lo publica la Action `.github/workflows/apps-script.yml`:

1. Guarda un respaldo: crea una versión con el código que está hoy en Apps Script.
2. Sube `Código.gs` e `Index.html`. El manifiesto (`appsscript.json`) se toma del proyecto de Apps Script, no del repositorio.
3. Publica una versión nueva en la misma implementación, así el link `/exec` no cambia.

También se puede correr a mano desde la pestaña **Actions → Publicar en Apps Script → Run workflow**.

**Para volver atrás:** en Apps Script, entrá a Implementar → Gestionar implementaciones → Editar y elegí la versión "Respaldo antes de GitHub …".

> Desde que esto está activo, el código se edita solo en GitHub. Lo que se cambie en el editor de Apps Script se pisa en la próxima publicación.

### Configuración (una sola vez, desde el navegador)

1. Activá la API de Apps Script en https://script.google.com/home/usersettings.
2. Abrí Google Cloud Shell (https://shell.cloud.google.com) y corré:
   ```
   npx @google/clasp@2.4.2 login --no-localhost
   cat ~/.clasprc.json
   ```
   Autorizá con la cuenta dueña del script y copiá lo que muestra el segundo comando.
3. En GitHub, andá a **Settings → Secrets and variables → Actions → New repository secret** y creá:
   - `CLASPRC_JSON`: lo copiado en el paso 2. Es una credencial: no la pegues en ningún otro lado.
   - `SCRIPT_ID`: el ID del script, que está en Configuración del proyecto de Apps Script.
   - `DEPLOYMENT_ID`: `AKfycbzHN2YsUy94lXMT0RcSLfnuXQzx9j9ov4MleXNQhyPAKr7-tEwLIGEmnYcKaeA7pmh2IQ`.
4. Corré la Action a mano una vez (Actions → Run workflow) y revisá que la app siga funcionando.

Si faltan los secretos, la Action no hace nada.

## Dominio propio (bgpsammar.com)

Apps Script no permite usar un dominio propio directamente. Por eso `bgpsammar.com` sirve `docs/index.html` desde GitHub Pages, y esa página carga la app en un `iframe`. Mientras carga se ve el video de presentación (con "Saltar"); al terminar aparece el ingreso o, si ya hay sesión, el selector de secciones.

1. `doGet()` ya usa `setXFrameOptionsMode(ALLOWALL)`, que permite mostrar la app dentro del iframe. Para que tome efecto, publicá una **versión nueva** de la implementación existente, así la URL `/exec` no cambia.
2. Si la URL `/exec` cambia algún día, actualizala en `docs/index.html`.
3. En GitHub, andá a **Settings → Pages** y elegí:
   - Source: *Deploy from a branch*
   - Branch: `main`
   - Carpeta: `/docs`

   El archivo `docs/CNAME` ya tiene `bgpsammar.com`. Cuando el DNS funcione, activá **Enforce HTTPS**.
4. En el proveedor del dominio, cargá estos registros DNS:

   | Tipo  | Nombre | Valor                   |
   |-------|--------|-------------------------|
   | A     | @      | 185.199.108.153         |
   | A     | @      | 185.199.109.153         |
   | A     | @      | 185.199.110.153         |
   | A     | @      | 185.199.111.153         |
   | CNAME | www    | portafoliofg.github.io  |

   Borrá cualquier otro registro `A` o `CNAME` de `@` y `www` que apunte a otro lado. El DNS puede tardar de minutos a 24 horas en propagarse.

### Ingreso

Es el único ingreso: la app de Tesorería ya no tiene el suyo (si se abre sin sesión, manda a `bgpsammar.com`). Después del video, `bgpsammar.com` pide usuario y contraseña. Son los usuarios de la pestaña Usuarios de Tesorería: `docs/sesion.js` los valida contra `doPost()` de `Código.gs`, que solo atiende ingreso, consulta de sesión y salida. Con la sesión iniciada aparece el selector, y la página le pasa la sesión a la app de Tesorería por `postMessage` para que no la vuelva a pedir. `propiedades.html` también exige sesión. Salir desde la página o desde la app cierra las dos.

### Video de presentación

`docs/carga.webm` y `docs/carga.mp4` (sin sonido) son el mismo video; `carga.jpg` es su primer cuadro. Al cambiar el video, subir el `?v=` de esos archivos en `index.html` para que el navegador no use la copia vieja. Si el video no puede reproducirse, o el sistema pide menos movimiento, se pasa directo al ingreso o al selector.

## Limitaciones a tener en cuenta

- El código sigue corriendo en Google Apps Script. El dominio propio solo cambia la dirección que ve el usuario.
- La sesión se guarda en `bgpsammar.com` (`bgp-sesion`) y se le pasa a la app; dura 6 horas sin uso. Si la app se abre directo por la URL `/exec`, sin pasar por `bgpsammar.com`, pide ir al ingreso.
- Si la app no se ejecuta como el usuario que la implementa, o el acceso no es "Cualquier persona", Google puede pedir iniciar sesión o mostrar su aviso dentro del iframe.
