# Asistente de Tesorería (texto y voz)

Chat con inteligencia artificial que responde preguntas sobre los datos de la app
(saldos, cheques, movimientos, vencimientos, FCI y bolsa, facturas, propiedades y
actividad de la app), escribiendo o hablando. Usa la API de **Gemini** de Google en
su nivel **gratuito**.

- **Dentro de la app**: botón redondo abajo a la derecha (aparece con la sesión iniciada).
- **Por fuera**: [bgpsammar.com/asistente/](https://bgpsammar.com/asistente/), desde cualquier
  dispositivo, con el mismo usuario y contraseña de Tesorería. En el celular se puede
  agregar a la pantalla de inicio (menú del navegador → *Agregar a la pantalla principal*)
  y queda como una app.

**Solo de lectura y para consultas.** Responde lo que se le pregunta con los datos de la app.
No puede cargar, editar, borrar, conciliar ni enviar nada, no guarda notas, pendientes ni
recordatorios, y no analiza, no recomienda ni avisa por su cuenta si algo no cuadra. Si se le
pide un análisis o una recomendación, contesta que solo puede mostrar los datos.

## Activarlo (una sola vez, 5 minutos)

1. Entrá a [aistudio.google.com/apikey](https://aistudio.google.com/apikey) con una cuenta
   de Google y tocá **Create API key**. No pide tarjeta.
2. Copiá la clave.
3. Abrí el proyecto de Apps Script de Tesorería → **Configuración del proyecto** (engranaje)
   → **Propiedades del script** → **Agregar propiedad**:
   - Propiedad: `GEMINI_API_KEY`
   - Valor: la clave que copiaste.
4. Guardá. Listo: no hace falta volver a publicar.

La clave queda solo en el servidor; nunca viaja a la página ni está en el repositorio.

### Opcionales (también en Propiedades del script)

| Propiedad | Para qué | Por defecto |
|---|---|---|
| `ASISTENTE_NOMBRE` | Cómo se llama el asistente | `Amaroki` (el ícono es una Amarok V6) |
| `GEMINI_MODELO` | Forzar un modelo (por ejemplo `gemini-3.8-flash`) | Lo elige solo |
| `ASISTENTE_LIMITE_HORA` | Preguntas por usuario por hora | `40` |

## Cómo se usa

- **Escribir**: Enter envía, Shift+Enter hace un salto de línea.
- **Hablar**: tocá el micrófono, hacé la pregunta y esperá: envía solo cuando terminás de hablar.
  La respuesta se lee en voz alta.
- **Parlante** (arriba): leer en voz alta también las respuestas escritas.
- **Auriculares** (arriba) = **manos libres**: después de cada respuesta vuelve a escuchar.
  Se apaga diciendo *"listo"*, *"gracias"* o *"chau"*, o si no escucha nada.
- **Lápiz**: empieza una charla nueva. La charla queda guardada en ese navegador.

## Respuestas rápidas (sin Gemini)

Las preguntas más comunes se contestan directo con los datos, en uno o dos segundos y sin
gastar cuota (debajo de la respuesta dice *Usó: respuesta rápida*):

| Pregunta | Qué contesta |
|---|---|
| *Cheques en cartera para octubre*, *cheques a cobrar el mes que viene* | Cheques de terceros abiertos (en cartera o en custodia) por fecha de pago, con total y lista. |
| *Cheques emitidos de esta semana*, *cheques vencidos sin pagar* | Cheques emitidos pendientes. |
| *¿Qué cheques vencen esta semana?* | Los dos: a cobrar y a pagar. |
| *¿Cuánto tenemos de saldo a favor?*, *¿cuánta plata tenemos?* | Cuentas + FCI (último saldo informado); con "a favor" suma también los cheques de terceros en cartera. |
| *Saldo de Galicia*, *saldo de FCI* | Las cuentas y el FCI de ese banco, o todos los FCI. |
| *Rendimiento del FCI de BBVA*, *¿cuánto rindió el FCI en septiembre?* | Rendimiento y TNA por banco, igual que en FCI y Bolsa (por defecto, últimos 30 días). También entiende el nombre del fondo. |
| *¿Qué vence esta semana?*, *pagos de los próximos 15 días* | Cheques, bolsa, compromisos y recordatorios a pagar y a cobrar. |

Entiende *hoy*, *mañana*, *esta semana*, *la semana que viene*, *este mes*, *el mes que viene*,
*el mes pasado*, un mes por nombre (con año o sin) y *próximos / últimos N días*. Si la pregunta
pide algo más (por qué, comparar, un cheque o una persona puntual, facturas, propiedades…) o
una repregunta (*¿y en noviembre?*), la contesta Gemini como siempre. Las reglas están en
`src/AsistenteRapido.gs`.

## Memoria guardada (solo lectura)

Antes Amaroki podía guardar memoria, pendientes y recordatorios. Ya no escribe nada. Lo que quedó
en la hoja **Asistente · Memoria** (por ejemplo *"el FCI de Bancor es para sueldos"*) se le sigue
pasando como contexto para entender los datos; se puede corregir a mano en la planilla. La hoja
**Asistente · Pendientes** ya no se usa.

Navegadores con dictado: Chrome, Edge y Safari (compu y celular). En Firefox graba el
audio y lo transcribe Gemini. Dentro de la app, si el navegador no deja usar el micrófono,
el chat ofrece abrir su página, donde funciona.

## Límites del nivel gratuito

- Google pone un tope de pedidos por día a cada modelo. Cada pregunta usa entre 1 y 4
  pedidos (uno más por cada consulta a los datos). Si se agota el modelo principal (Flash),
  el asistente pasa solo a Flash-Lite, que tiene más cuota. La cuota se renueva a la
  medianoche de California (madrugada en Argentina). El consumo se ve en
  [aistudio.google.com](https://aistudio.google.com).
- **Privacidad**: en el nivel gratuito, Google usa lo que se le manda para mejorar sus
  productos y puede revisarlo una persona. El asistente manda la pregunta y los datos que
  necesita para responderla (saldos, movimientos, etc.). Si eso no es aceptable para la
  empresa, basta con activar la facturación en ese proyecto de Google AI Studio: con el
  nivel pago los datos no se usan para entrenar (y para este uso el costo es bajo).
- **Más cuota**: desde el código no se puede aumentar. Si alguna vez no alcanza, en
  [aistudio.google.com](https://aistudio.google.com) → *Billing* se activa la facturación del proyecto
  (nivel pago 1): los límites suben mucho y, con pocas consultas por día, el costo es de centavos.
- Las respuestas las genera una IA: pueden tener errores. Para decisiones, verificá en la app.

## Si no responde

- El chat espera hasta 3 minutos y, si no hay respuesta, avisa (antes podía quedar esperando
  para siempre). El servidor le pide a Gemini que "piense" poco, para que conteste más rápido.
- Para ver qué pasa: en el editor de Apps Script elegí la función `probarAsistente` y tocá
  **Ejecutar**. En el registro aparece la respuesta, el modelo que usó y cuánto tardó cada paso.
  También en **Ejecuciones** (menú de la izquierda) se ve el detalle de cada pregunta.

## Qué archivos son del asistente

| Archivo | Qué es |
|---|---|
| `src/Asistente.gs` | Servidor: llama a Gemini y hace las consultas (solo lectura). La revisión de cosas que no cuadran que queda ahí la usa el tablero F1, no Amaroki. |
| `src/AsistenteRapido.gs` | Respuestas rápidas sin Gemini (cheques, saldos, rendimiento del FCI, vencimientos). |
| `docs/asistente/` | Página propia, chat (`asistente.js`, el mismo para la app y la página) y manifiesto. |
| `ASISTENTE.md` | Este archivo. |

Y tres líneas marcadas con `ASISTENTE` en archivos existentes:

- `src/Código.gs`: `'asistente'` en `ACCIONES_SITIO` y la entrada `asistente:` en `ACCIONES`.
- `src/Index.html`: el `<script>` que carga el chat (antes de `</body>`).
- `docs/index.html`: `microphone` en el `allow` del iframe de la app.

## Quitarlo

1. Borrar `src/Asistente.gs`, la carpeta `docs/asistente/` y este archivo.
2. Borrar las líneas marcadas con `ASISTENTE` (lista de arriba). En `Código.gs` dejá
   `ACCIONES_SITIO` como estaba: `['estado', 'login', 'logout', 'obtenerPropiedades', 'guardarPropiedades']`.
3. Opcional: borrar las propiedades `GEMINI_API_KEY` y `ASIS_VISTOS_…`, las hojas `Asistente · Memoria` y
   `Asistente · Pendientes`, y la clave en AI Studio.

Si solo se borra `Asistente.gs` y quedan las líneas, la app sigue funcionando igual:
el chat avisa que el asistente no está instalado.
