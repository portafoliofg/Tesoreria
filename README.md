# Tesorería

Lector de comprobantes y tesorería: una web app de Google Apps Script vinculada a una planilla de Google Sheets.

## Estructura

```
src/
  Código.gs        Código del servidor (Apps Script)
  Index.html       Interfaz (HTML, CSS y JS)
  appsscript.json  Manifiesto del proyecto
docs/
  index.html       Página de bgpsammar.com: pantalla de carga + la app en un iframe
  loader.js/.css   Pantalla de carga de 7 s (B.G.P Sammar)
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

Apps Script no permite usar un dominio propio directamente. Por eso `bgpsammar.com` sirve `docs/index.html` desde GitHub Pages, y esa página carga la app en un `iframe`. Mientras carga, se ve una animación de 7 segundos. Se oculta cuando terminaron los 7 segundos y la app ya cargó, o a los 20 segundos como máximo.

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

### Pantalla de carga

`docs/loader.js` expone `BGPLoader.create(contenedor, { duracion, alTerminar })`, que devuelve `reiniciar()`, `estado(texto)` y `destroy()`. Usa JS y SVG sin librerías, así carga al instante y no necesita compilarse.

## Limitaciones a tener en cuenta

- El código sigue corriendo en Google Apps Script. El dominio propio solo cambia la dirección que ve el usuario.
- Algunos navegadores (Safari, Chrome con cookies de terceros bloqueadas) aíslan el almacenamiento dentro de un iframe. Por eso la sesión guardada (`lc-sesion`) puede no recordarse entre visitas. Si pasa, hay que volver a iniciar sesión, o usar directamente la URL `/exec`.
- Si la app no se ejecuta como el usuario que la implementa, o el acceso no es "Cualquier persona", Google puede pedir iniciar sesión o mostrar su aviso dentro del iframe.
