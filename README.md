# Tesorería

Lector de comprobantes y tesorería: una web app de Google Apps Script vinculada a una planilla de Google Sheets.

## Estructura

```
src/
  Code.gs          Código del servidor (Apps Script)
  Index.html       Interfaz (HTML, CSS y JS)
  appsscript.json  Manifiesto del proyecto
docs/
  index.html       Página de bgpsammar.com: pantalla de carga + la app en un iframe
  loader.js/.css   Pantalla de carga de 7 s (B.G.P Sammar)
  CNAME            Dominio propio para GitHub Pages
.clasp.json.example
```

## Sincronizar con Apps Script (clasp)

1. Instalá clasp: `npm install -g @google/clasp`
2. Iniciá sesión: `clasp login`
3. Copiá `.clasp.json.example` a `.clasp.json` y poné el **ID del script**. Lo encontrás en el editor de Apps Script, en Configuración del proyecto → ID de la secuencia de comandos.
4. Subí el código: `clasp push`. Para traer cambios hechos en el editor: `clasp pull`.

> `.clasp.json` está en `.gitignore`, así que cada persona usa su propio archivo.
> Revisá que `src/appsscript.json` coincida con el manifiesto actual del proyecto (zona horaria y acceso de la web app) antes del primer `clasp push`.

## Publicar una versión nueva

En el editor de Apps Script, entrá a **Implementar → Gestionar implementaciones**. Editá la implementación existente, elegí **Versión nueva** y guardá. Así la URL `/exec` no cambia.

Con clasp: `clasp deploy -i <ID_DE_IMPLEMENTACION>`.

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
