# Tesorería

Lector de comprobantes y tesorería: una web app de Google Apps Script vinculada a una planilla de Google Sheets.

## Estructura

```
src/
  Code.gs          Código del servidor (Apps Script)
  Index.html       Interfaz (HTML, CSS y JS)
  appsscript.json  Manifiesto del proyecto
docs/
  index.html       Página para GitHub Pages que muestra la app con el dominio propio
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

## Dominio propio

Apps Script no permite usar un dominio propio directamente. La app se muestra dentro de una página de GitHub Pages que la carga en un `iframe`:

1. Abrí `docs/index.html` y reemplazá `https://script.google.com/macros/s/TU_ID/exec` por la URL `/exec` de la implementación.
2. `doGet()` ya usa `setXFrameOptionsMode(ALLOWALL)`, que es lo que permite mostrar la app dentro del iframe. Publicá una versión nueva para que el cambio tome efecto.
3. En GitHub, andá a **Settings → Pages** y elegí:
   - Source: *Deploy from a branch*
   - Branch: `main`
   - Carpeta: `/docs`
4. En el mismo lugar, en **Custom domain**, escribí tu dominio (por ejemplo `tesoreria.tuempresa.com`) y activá **Enforce HTTPS**.
5. En el proveedor del dominio, configurá el DNS:
   - **Subdominio** (`tesoreria.tuempresa.com`): un registro `CNAME` que apunte a `portafoliofg.github.io`.
   - **Dominio raíz** (`tuempresa.com`): registros `A` a `185.199.108.153`, `185.199.109.153`, `185.199.110.153` y `185.199.111.153`.

## Limitaciones a tener en cuenta

- El código sigue corriendo en Google Apps Script. El dominio propio solo cambia la dirección que ve el usuario.
- Algunos navegadores (Safari, Chrome con cookies de terceros bloqueadas) aíslan el almacenamiento dentro de un iframe. Por eso la sesión guardada (`lc-sesion`) puede no recordarse entre visitas. Si pasa, hay que volver a iniciar sesión, o usar directamente la URL `/exec`.
- Si la app no se ejecuta como el usuario que la implementa, o el acceso no es "Cualquier persona", Google puede pedir iniciar sesión o mostrar su aviso dentro del iframe.
