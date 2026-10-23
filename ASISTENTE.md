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

**Solo lee.** No puede cargar, editar, borrar, conciliar ni enviar nada.

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
| `ASISTENTE_NOMBRE` | Cómo se llama el asistente (por ejemplo `Jarvis`) | `Asistente` |
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
- Las respuestas las genera una IA: pueden tener errores. Para decisiones, verificá en la app.

## Qué archivos son del asistente

| Archivo | Qué es |
|---|---|
| `src/Asistente.gs` | Servidor: llama a Gemini y hace las consultas (solo lectura). |
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
3. Opcional: borrar la propiedad `GEMINI_API_KEY` y la clave en AI Studio.

Si solo se borra `Asistente.gs` y quedan las líneas, la app sigue funcionando igual:
el chat avisa que el asistente no está instalado.
