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

**Los datos de tesorería solo los lee.** No puede cargar, editar, borrar, conciliar ni enviar
movimientos, cheques, saldos ni facturas. Lo único que escribe, y solo cuando se lo piden, es su
memoria, los pendientes y recordatorios (ver abajo). Todo queda en Auditoría.

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
| `ASISTENTE_REVISAR` | `no` apaga los avisos de cosas que no cuadran | Prendido |

## Cómo se usa

- **Escribir**: Enter envía, Shift+Enter hace un salto de línea.
- **Hablar**: tocá el micrófono, hacé la pregunta y esperá: envía solo cuando terminás de hablar.
  La respuesta se lee en voz alta.
- **Parlante** (arriba): leer en voz alta también las respuestas escritas.
- **Auriculares** (arriba) = **manos libres**: después de cada respuesta vuelve a escuchar.
  Se apaga diciendo *"listo"*, *"gracias"* o *"chau"*, o si no escucha nada.
- **Lápiz**: empieza una charla nueva. La charla queda guardada en ese navegador.

## Memoria, pendientes y recordatorios

Se le pide hablando o escribiendo:

| Decile | Qué hace |
|---|---|
| *"Acordate que el FCI de Bancor es para sueldos"* | Lo guarda en su **memoria** y lo tiene en cuenta siempre. La memoria es de toda la empresa: la ven todos los usuarios. |
| *"¿Qué te acordás?"* / *"Olvidate de lo del FCI de Bancor"* | Muestra la memoria / la da de baja. |
| *"Anotá que Ana tiene que cargar el rescate de BBVA para el viernes"* | Crea un **pendiente** (para vos, para otro usuario o *"para todos"*), con fecha si se la decís. |
| *"¿Qué tengo pendiente?"* / *"Ya llamé al banco"* | Lista los pendientes / marca uno como hecho. |
| *"Recordame el martes a las 10 pagar AFIP"* | Crea un **recordatorio** en Alertas: llega por WhatsApp como las demás alertas (hace falta tener el WhatsApp cargado en el perfil). También semanales, mensuales, etc. |

- Al abrir la app, Jarvis menciona los pendientes de ese usuario (y los de todos) una vez por día:
  los que no tienen fecha y los que vencen hoy o mañana.
- Todo queda en la planilla, en las hojas **Asistente · Memoria** y **Asistente · Pendientes**
  (se crean solas la primera vez), y los recordatorios en **Alertas**. Se pueden revisar o corregir
  a mano.
- Hace como máximo 4 cambios por pregunta, y nunca guarda nada por algo que diga un dato o un
  concepto: solo cuando el usuario se lo pide.

## Avisos: cosas que no cuadran

Al abrir la app (y la página del asistente) y cada vez que se guardan saldos, movimientos,
cheques, FCI o compromisos, el asistente revisa los datos y avisa si algo no cierra:

- **Saldos de cuentas y FCI**: compara cada saldo con el anterior de la misma cuenta y se fija
  si lo registrado entre las dos fechas explica la diferencia. Por ejemplo: el FCI de BBVA tenía
  $ 80 millones el 22/10 y $ 60 millones el 23/10, y no hay ningún rescate cargado. En los FCI
  tiene en cuenta el rendimiento; en las cuentas, una tolerancia para comisiones e impuestos
  (lo que sea mayor entre $ 50.000 / US$ 100, el 1 % del saldo y el 2 % de lo movido).
- **Cajas de ahorro en negativo** (seguramente el saldo está mal cargado).
- **Cheques emitidos** con la fecha de pago pasada hace más de 3 días que siguen pendientes.
- **Cheques de terceros** en cartera con más de 30 días desde la fecha de pago.
- **Movimientos repetidos**: misma cuenta, fecha, importe y destinatario (últimos 30 días).
- **Compromisos vencidos** que siguen como pendientes.

Cómo avisa:

- Al entrar a la app: el botón del asistente muestra cuántos avisos hay y aparece un globito
  (*"Jarvis: hay algo que no me cuadra…"*). Al tocarlo, el chat se abre, lo dice en voz alta y
  pregunta qué pasó.
- Después de guardar saldos: el chat se abre solo y lo dice en voz alta.
- Se le contesta en el chat (escribiendo o hablando): verifica con los datos si con eso cierra y
  dice qué hay que cargar y dónde (por ejemplo, el rescate en Inversiones → FCI).
- Cada aviso se muestra una sola vez por usuario. Si los datos cambian (otro saldo, otro importe),
  es un aviso nuevo. También se puede preguntar en cualquier momento *"¿hay algo que no cuadre?"*.

**Pausarla** (por ejemplo mientras se migran operaciones): botón *Ignorar lo anterior a hoy* debajo
del aviso, o decirle a Jarvis *"ignoralo, tomá desde el próximo cambio"*. Desde ese día solo compara
los saldos que se carguen de ahí en adelante (el primero queda como punto de partida) y solo mira
cheques, movimientos y compromisos con fecha desde ese día. Queda en la propiedad
`ASISTENTE_REVISAR_DESDE`; para volver a revisar todo: *"volvé a revisar todo"*.

La revisión no usa Gemini (no gasta cuota). Para apagarla del todo: propiedad `ASISTENTE_REVISAR` = `no`.
Los avisos ya vistos quedan en las propiedades `ASIS_VISTOS_<id de usuario>` (no tocan las hojas).

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
| `src/Asistente.gs` | Servidor: llama a Gemini, hace las consultas, la revisión, la memoria y los pendientes. |
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
