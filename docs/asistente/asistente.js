/*
 * Asistente de Tesorería · chat por texto y por voz (bgpsammar.com)
 *
 * Un solo archivo para los dos lugares donde aparece:
 *  - Dentro de la app de Tesorería (Apps Script): un botón flotante abajo a la
 *    derecha que abre el chat. Index.html carga este archivo con una línea marcada
 *    "ASISTENTE" y le habla al servidor con runJson("asistente", …).
 *  - Su propia página, bgpsammar.com/asistente/ (celular, tablet o compu): la
 *    página llama a Asistente.montarPagina(…) y le habla al servidor por fetch,
 *    con la sesión de bgpsammar.com (sesion.js).
 *
 * Voz: dicta con el reconocimiento de voz del navegador (Chrome, Edge, Safari).
 * Si el navegador no tiene, graba el audio y lo transcribe Gemini en el servidor.
 * Las respuestas se leen en voz alta con la voz en español del dispositivo.
 * "Manos libres": después de leer la respuesta vuelve a escuchar solo.
 *
 * Avisos: al abrir la app (o la página) y después de guardar saldos o movimientos,
 * le pide al servidor la revisión de cosas que no cuadran (op "revisar"). Si hay
 * avisos nuevos, el botón muestra cuántos y aparece un globito; si se acaban de
 * guardar saldos, el chat se abre solo, lo dice en voz alta y pregunta qué pasó.
 *
 * Asistente.montarPagina(contenedor, {usuario, alSalir})  chat a pantalla completa
 * Asistente.abrir() / Asistente.cerrar()                 panel flotante (dentro de la app)
 */
(function () {
  "use strict";
  if (window.Asistente) return;

  // Misma URL /exec que docs/sesion.js: si cambia, actualizarla en los dos.
  var URL_APP = "https://script.google.com/macros/s/AKfycbzHN2YsUy94lXMT0RcSLfnuXQzx9j9ov4MleXNQhyPAKr7-tEwLIGEmnYcKaeA7pmh2IQ/exec";
  var PAGINA = "https://bgpsammar.com/asistente/";
  var ESPERA_MS = 120000;
  var MAX_GUARDADOS = 40;
  var MAX_HISTORIAL = 12;
  var GRABACION_MAX_MS = 25000;
  var PALABRAS_FIN = ["listo", "gracias", "muchas gracias", "chau", "nada mas", "eso es todo", "basta", "terminamos"];
  var NOMBRES_CONSULTA = {
    buscar_movimientos: "movimientos", buscar_cheques: "cheques", saldos: "saldos", cuentas_bancarias: "cuentas",
    proximos_vencimientos: "vencimientos", compromisos: "compromisos", inversiones: "inversiones",
    propiedades: "propiedades", actividad_de_la_app: "actividad de la app", facturas: "facturas",
    revisar_inconsistencias: "revisión"
  };
  // Acciones de la app después de las cuales se vuelve a revisar si algo no cuadra.
  var ACCIONES_QUE_CAMBIAN = ["guardarSaldos", "guardarSaldo", "guardarMovimientosFci", "eliminarMovimientoFci", "guardarTransferencias", "cambiarCondicion",
    "guardarCheques", "registrarSalidaCheques", "importarPlanilla", "guardarCompromiso", "eliminarCompromiso", "guardarConciliacion", "anularConciliacion"];
  var ACCIONES_DE_SALDOS = ["guardarSaldos", "guardarSaldo"];

  var ICONOS = {
    chispa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/></svg>',
    parar: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
    enviar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13"/><path d="M13 6l6 6-6 6"/></svg>',
    parlante: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    silencio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5"/><path d="M21 9.5l-5 5"/></svg>',
    manos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>',
    nueva: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    expandir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-7 7"/><path d="M10 20H4v-6"/><path d="M4 20l7-7"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>'
  };

  // ---------------- Estilos ----------------
  // Todo cuelga de #asis-raiz: así el diseño de la app no pisa los botones del chat.
  // Toma los colores de la app (o de la página) con valores de respaldo.
  var CSS = [
    "#asis-raiz, #asis-raiz * { box-sizing: border-box; }",
    "#asis-raiz { --a-primario: var(--primary, #1c4a2c); --a-primario-rgb: var(--primary-rgb, 28, 74, 44); --a-acento: var(--accent, #a87a2f);",
    "  --a-fondo: var(--surface, #ffffff); --a-fondo-2: var(--surface-2, #f6f2ec); --a-fondo-3: var(--surface-3, #ebe5dd);",
    "  --a-borde: var(--border, rgba(28, 74, 44, .14)); --a-texto: var(--text, #24322a); --a-tenue: var(--muted, #6d7469); --a-rojo: #b3392f;",
    "  font-family: var(--font, 'Manrope', 'Segoe UI', system-ui, sans-serif); color: var(--a-texto); font-size: 15px; line-height: 1.45; }",
    "#asis-raiz button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; }",
    "#asis-raiz button:focus-visible { outline: 2px solid var(--a-acento); outline-offset: 2px; }",
    "#asis-raiz button svg { width: 20px; height: 20px; flex: none; }",
    "#asis-raiz .asis-chat { display: flex; flex-direction: column; min-height: 0; min-width: 0; width: 100%; background: var(--a-fondo); }",
    "#asis-raiz .asis-chat > * { min-width: 0; }",
    "#asis-raiz .asis-cab { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 16px; border-bottom: 1px solid var(--a-borde); background: var(--a-fondo); }",
    "#asis-raiz .asis-avatar { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; color: #fff; flex: none;",
    "  background: linear-gradient(145deg, var(--a-acento), var(--a-primario)); box-shadow: 0 6px 16px -8px rgba(var(--a-primario-rgb), .9); }",
    "#asis-raiz .asis-avatar svg { width: 19px; height: 19px; }",
    "#asis-raiz .asis-titulo { flex: 1; min-width: 0; }",
    "#asis-raiz .asis-titulo b { display: block; font-size: 15px; font-weight: 700; letter-spacing: .01em; }",
    "#asis-raiz .asis-titulo span { display: block; font-size: 12px; color: var(--a-tenue); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
    "#asis-raiz .asis-titulo span.vivo { color: var(--a-primario); font-weight: 600; }",
    "#asis-raiz .asis-icono { width: 36px; height: 36px; border-radius: 10px; color: var(--a-tenue); }",
    "#asis-raiz .asis-icono:hover { background: var(--a-fondo-2); color: var(--a-texto); }",
    "#asis-raiz .asis-icono[aria-pressed=true] { color: var(--a-primario); background: rgba(var(--a-primario-rgb), .1); }",
    "#asis-raiz .asis-lista { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 16px 8px; display: flex; flex-direction: column; gap: 12px; scroll-behavior: smooth; overscroll-behavior: contain; }",
    "#asis-raiz .asis-msg { max-width: 88%; padding: 10px 14px; border-radius: 16px; word-wrap: break-word; overflow-wrap: anywhere; animation: asis-entra .22s ease-out; }",
    "#asis-raiz .asis-msg.usuario { align-self: flex-end; background: var(--a-primario); color: #fff; border-bottom-right-radius: 6px; white-space: pre-wrap; }",
    "#asis-raiz .asis-msg.asistente { align-self: flex-start; background: var(--a-fondo-2); border: 1px solid var(--a-borde); border-bottom-left-radius: 6px; }",
    "#asis-raiz .asis-msg.error { align-self: stretch; max-width: none; background: rgba(179, 57, 47, .07); border: 1px solid rgba(179, 57, 47, .28); color: var(--a-rojo); font-size: 14px; }",
    "#asis-raiz .asis-msg.error a { color: inherit; font-weight: 700; }",
    "#asis-raiz .asis-msg p { margin: 0; }",
    "#asis-raiz .asis-msg p + p, #asis-raiz .asis-msg ul + p, #asis-raiz .asis-msg ol + p, #asis-raiz .asis-msg p + ul, #asis-raiz .asis-msg p + ol { margin-top: 7px; }",
    "#asis-raiz .asis-msg ul, #asis-raiz .asis-msg ol { margin: 4px 0 0; padding-left: 20px; }",
    "#asis-raiz .asis-msg li + li { margin-top: 3px; }",
    "#asis-raiz .asis-msg strong { font-weight: 700; }",
    "#asis-raiz .asis-msg.asistente strong { color: var(--a-primario); }",
    "#asis-raiz .asis-msg.asistente.alerta { background: rgba(217, 180, 106, .13); border-color: rgba(184, 137, 58, .5); }",
    "#asis-raiz .asis-etiqueta { margin-bottom: 4px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--a-acento); }",
    "#asis-raiz .asis-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 7px; font-size: 11.5px; color: var(--a-tenue); }",
    "#asis-raiz .asis-meta button { color: var(--a-tenue); font-size: 11.5px; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }",
    "#asis-raiz .asis-meta button:hover { color: var(--a-primario); }",
    "#asis-raiz .asis-pensando { align-self: flex-start; display: inline-flex; gap: 5px; padding: 13px 16px; border-radius: 16px; background: var(--a-fondo-2); border: 1px solid var(--a-borde); }",
    "#asis-raiz .asis-pensando i { width: 7px; height: 7px; border-radius: 50%; background: var(--a-primario); opacity: .35; animation: asis-punto 1.1s infinite ease-in-out; }",
    "#asis-raiz .asis-pensando i:nth-child(2) { animation-delay: .15s; } #asis-raiz .asis-pensando i:nth-child(3) { animation-delay: .3s; }",
    "#asis-raiz .asis-bienvenida { margin: auto 0; padding: 8px 4px 4px; text-align: center; }",
    "#asis-raiz .asis-bienvenida .asis-avatar { width: 54px; height: 54px; border-radius: 17px; margin: 0 auto 12px; }",
    "#asis-raiz .asis-bienvenida .asis-avatar svg { width: 28px; height: 28px; }",
    "#asis-raiz .asis-bienvenida h3 { margin: 0 0 6px; font-size: 18px; font-weight: 700; }",
    "#asis-raiz .asis-bienvenida p { margin: 0 auto 16px; max-width: 360px; color: var(--a-tenue); font-size: 14px; }",
    "#asis-raiz .asis-sugerencias { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }",
    "#asis-raiz .asis-sugerencia { padding: 8px 12px; border-radius: 99px; border: 1px solid var(--a-borde); background: var(--a-fondo); font-size: 13px; color: var(--a-texto); text-align: left; line-height: 1.3; }",
    "#asis-raiz .asis-sugerencia:hover { border-color: rgba(var(--a-primario-rgb), .45); color: var(--a-primario); }",
    "#asis-raiz .asis-aviso { margin: 10px 16px 0; padding: 9px 12px; border-radius: 12px; font-size: 13px; color: #7a5a22; background: rgba(217, 180, 106, .16); border: 1px solid rgba(184, 137, 58, .38); }",
    "#asis-raiz .asis-escucha { display: none; align-items: center; gap: 12px; margin: 0 12px; padding: 10px 14px; border-radius: 14px; background: rgba(var(--a-primario-rgb), .08); color: var(--a-primario); font-size: 14px; }",
    "#asis-raiz .asis-escucha.activa { display: flex; }",
    "#asis-raiz .asis-onda { display: inline-flex; align-items: center; gap: 3px; height: 18px; flex: none; }",
    "#asis-raiz .asis-onda i { width: 3px; height: 6px; border-radius: 2px; background: currentColor; animation: asis-onda .9s infinite ease-in-out; }",
    "#asis-raiz .asis-onda i:nth-child(2) { animation-delay: .12s; } #asis-raiz .asis-onda i:nth-child(3) { animation-delay: .24s; } #asis-raiz .asis-onda i:nth-child(4) { animation-delay: .36s; }",
    "#asis-raiz .asis-escucha span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
    "#asis-raiz .asis-pie { padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--a-borde); background: var(--a-fondo); }",
    "#asis-raiz .asis-entrada { display: flex; align-items: flex-end; gap: 8px; padding: 6px 6px 6px 14px; border-radius: 20px; border: 1px solid var(--a-borde); background: var(--a-fondo-2); }",
    "#asis-raiz .asis-entrada:focus-within { border-color: rgba(var(--a-primario-rgb), .5); box-shadow: 0 0 0 3px rgba(var(--a-primario-rgb), .1); }",
    "#asis-raiz textarea { all: unset; flex: 1; min-width: 0; min-height: 24px; max-height: 140px; padding: 7px 0; font: inherit; font-size: 16px; color: var(--a-texto); white-space: pre-wrap; overflow-y: auto; word-break: break-word; }",
    "#asis-raiz textarea::placeholder { color: var(--a-tenue); }",
    "#asis-raiz .asis-boton-redondo { width: 40px; height: 40px; border-radius: 50%; flex: none; color: var(--a-tenue); }",
    "#asis-raiz .asis-boton-redondo:hover { color: var(--a-primario); background: rgba(var(--a-primario-rgb), .08); }",
    "#asis-raiz .asis-enviar { color: #fff; background: var(--a-primario); }",
    "#asis-raiz .asis-enviar:hover { color: #fff; background: var(--a-primario); filter: brightness(1.1); }",
    "#asis-raiz .asis-enviar[disabled] { opacity: .35; cursor: default; filter: none; }",
    "#asis-raiz .asis-mic.escuchando { color: #fff; background: var(--a-rojo); animation: asis-latido 1.4s infinite; }",
    "#asis-raiz .asis-nota { margin-top: 7px; text-align: center; font-size: 11px; color: var(--a-tenue); }",
    "@keyframes asis-entra { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }",
    "@keyframes asis-punto { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }",
    "@keyframes asis-onda { 0%, 100% { height: 5px; } 50% { height: 18px; } }",
    "@keyframes asis-llamada { 0%, 60%, 100% { box-shadow: 0 14px 30px -12px rgba(var(--a-primario-rgb), .9), 0 0 0 0 rgba(179, 57, 47, .45); } 30% { box-shadow: 0 14px 30px -12px rgba(var(--a-primario-rgb), .9), 0 0 0 10px rgba(179, 57, 47, 0); } }",
    "@keyframes asis-latido { 0% { box-shadow: 0 0 0 0 rgba(179, 57, 47, .5); } 70% { box-shadow: 0 0 0 12px rgba(179, 57, 47, 0); } 100% { box-shadow: 0 0 0 0 rgba(179, 57, 47, 0); } }",
    // Botón flotante y panel (dentro de la app)
    "#asis-raiz.flotante .asis-fab { position: fixed; right: 20px; bottom: calc(20px + env(safe-area-inset-bottom, 0px)); z-index: 2147483000; width: 56px; height: 56px; border-radius: 18px; color: #fff;",
    "  background: linear-gradient(145deg, var(--a-acento), var(--a-primario)); box-shadow: 0 14px 30px -12px rgba(var(--a-primario-rgb), .9), 0 2px 6px rgba(0, 0, 0, .15); transition: transform .18s ease, opacity .18s ease; }",
    "#asis-raiz.flotante .asis-fab:hover { transform: translateY(-2px) scale(1.03); }",
    "#asis-raiz.flotante .asis-fab svg { width: 26px; height: 26px; }",
    "#asis-raiz.flotante.abierto .asis-fab { opacity: 0; pointer-events: none; transform: scale(.8); }",
    "#asis-raiz.flotante .asis-fab.con-aviso { animation: asis-llamada 2.4s infinite; }",
    "#asis-raiz.flotante .asis-insignia { position: absolute; top: -6px; right: -6px; min-width: 21px; height: 21px; padding: 0 6px; border-radius: 11px; background: var(--a-rojo); color: #fff;",
    "  font-size: 12px; font-weight: 700; line-height: 21px; text-align: center; box-shadow: 0 0 0 2px var(--a-fondo); }",
    "#asis-raiz.flotante .asis-insignia[hidden] { display: none; }",
    "#asis-raiz.flotante .asis-burbuja { position: fixed; right: 20px; bottom: calc(88px + env(safe-area-inset-bottom, 0px)); z-index: 2147483000; width: max-content; max-width: min(300px, calc(100vw - 40px));",
    "  display: flex; align-items: flex-start; gap: 4px; padding: 10px 6px 10px 14px; border-radius: 16px 16px 4px 16px; background: var(--a-fondo); border: 1px solid rgba(184, 137, 58, .5);",
    "  box-shadow: 0 18px 40px -16px rgba(0, 0, 0, .45); animation: asis-entra .25s ease-out; }",
    "#asis-raiz.flotante .asis-burbuja[hidden], #asis-raiz.flotante.abierto .asis-burbuja { display: none; }",
    "#asis-raiz .asis-burbuja .asis-burbuja-texto { display: block; flex: 1; min-width: 0; padding-top: 3px; font-size: 13.5px; line-height: 1.38; color: var(--a-texto); text-align: left; }",
    "#asis-raiz .asis-burbuja .asis-burbuja-texto b { color: var(--a-primario); }",
    "#asis-raiz .asis-burbuja .asis-icono { width: 28px; height: 28px; border-radius: 8px; }",
    "#asis-raiz .asis-burbuja .asis-icono svg { width: 15px; height: 15px; }",
    "#asis-raiz.flotante .asis-panel { position: fixed; right: 20px; bottom: 20px; z-index: 2147483001; width: min(410px, calc(100vw - 40px)); height: min(640px, calc(100vh - 40px));",
    "  border-radius: 20px; overflow: hidden; border: 1px solid var(--a-borde); box-shadow: 0 30px 70px -24px rgba(0, 0, 0, .45);",
    "  opacity: 0; transform: translateY(16px) scale(.98); pointer-events: none; transition: opacity .2s ease, transform .2s ease; display: flex; }",
    "#asis-raiz.flotante.abierto .asis-panel { opacity: 1; transform: none; pointer-events: auto; }",
    "#asis-raiz.flotante .asis-panel .asis-chat { flex: 1; }",
    "@media (max-width: 640px) {",
    "  #asis-raiz.flotante .asis-fab { right: 14px; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); width: 52px; height: 52px; border-radius: 16px; }",
    "  #asis-raiz.flotante .asis-burbuja { right: 14px; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); max-width: calc(100vw - 28px); }",
    "  #asis-raiz.flotante .asis-panel { inset: 0; right: 0; bottom: 0; width: 100%; height: 100%; height: 100dvh; border-radius: 0; border: 0; }",
    "}",
    ":root[data-modo=oscuro] #asis-raiz .asis-aviso { color: #e9cf95; background: rgba(217, 180, 106, .1); }",
    ":root[data-modo=oscuro] #asis-raiz .asis-msg.error { color: #f0a49b; }",
    "@media print { #asis-raiz { display: none !important; } }",
    // Página propia
    "#asis-raiz.pagina { height: 100%; display: flex; }",
    "#asis-raiz.pagina .asis-chat { flex: 1; width: 100%; }",
    "#asis-raiz.pagina .asis-cab .asis-cerrar, #asis-raiz.pagina .asis-cab .asis-expandir { display: none; }",
    "#asis-raiz.pagina .asis-lista { padding: 24px max(16px, calc((100% - 760px) / 2)) 10px; }",
    "#asis-raiz.pagina .asis-pie, #asis-raiz.pagina .asis-escucha-caja { padding-left: max(12px, calc((100% - 784px) / 2)); padding-right: max(12px, calc((100% - 784px) / 2)); }",
    "#asis-raiz.pagina .asis-escucha { margin: 0; }",
    "#asis-raiz.pagina .asis-cab { padding-left: max(16px, calc((100% - 784px) / 2)); padding-right: max(12px, calc((100% - 784px) / 2)); }",
    "#asis-raiz.pagina .asis-mic { width: 48px; height: 48px; }",
    "#asis-raiz.pagina .asis-mic svg { width: 24px; height: 24px; }",
    "@media (prefers-reduced-motion: reduce) { #asis-raiz * { animation: none !important; transition: none !important; } }"
  ].join("\n");

  // ---------------- Utilidades ----------------
  function el(tag, clase, attrs, hijos) {
    var n = document.createElement(tag);
    if (clase) n.className = clase;
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "html") n.innerHTML = attrs[k];
      else if (k === "texto") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (hijos || []).forEach(function (h) { if (h) n.appendChild(h); });
    return n;
  }

  function esc(s) {
    return String(s == null ? "" : s).split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;").split('"').join("&quot;");
  }

  function soloDigitos(s) {
    for (var i = 0; i < s.length; i++) { var c = s.charAt(i); if (c < "0" || c > "9") return false; }
    return s.length > 0;
  }

  function sinTildes(s) {
    var base = String(s || "").toLowerCase().normalize("NFD"), r = "";
    for (var i = 0; i < base.length; i++) { var code = base.charCodeAt(i); if (code < 0x300 || code > 0x36f) r += base.charAt(i); }
    return r;
  }

  /** Normaliza para comparar frases dichas: minúsculas, sin tildes ni puntuación. */
  function frase(s) {
    var t = sinTildes(s), r = "";
    for (var i = 0; i < t.length; i++) { var c = t.charAt(i); r += (c >= "a" && c <= "z") || (c >= "0" && c <= "9") ? c : " "; }
    return r.split(" ").filter(Boolean).join(" ");
  }

  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function escribir(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  // **negrita** dentro de una línea ya escapada.
  function enLinea(s) {
    var e = esc(s);
    var partes = e.split("**");
    if (partes.length < 3) return e;
    var out = "";
    for (var i = 0; i < partes.length; i++) {
      if (i % 2 === 1 && i < partes.length - 1) out += "<strong>" + partes[i] + "</strong>";
      else out += (i % 2 === 1 ? "**" : "") + partes[i];
    }
    return out;
  }

  /** Markdown chico (párrafos, listas y negrita) → HTML seguro. */
  function aHtml(texto) {
    var html = [], lista = null, vacia = false;
    function cerrarLista() { if (lista) { html.push("</" + lista + ">"); lista = null; } }
    String(texto || "").split("\n").forEach(function (linea) {
      var t = linea.trim();
      while (t.charAt(0) === "#") t = t.substring(1);
      t = t.trim();
      var item = null, tipo = null;
      if (t.indexOf("- ") === 0 || t.indexOf("* ") === 0 || t.indexOf("• ") === 0) { item = t.substring(2); tipo = "ul"; }
      else {
        var p = t.indexOf(". ");
        if (p > 0 && p < 4 && soloDigitos(t.substring(0, p))) { item = t.substring(p + 2); tipo = "ol"; }
      }
      if (item !== null) {
        if (lista !== tipo) { cerrarLista(); html.push("<" + tipo + ">"); lista = tipo; }
        html.push("<li>" + enLinea(item) + "</li>");
        vacia = false;
        return;
      }
      if (!t) { cerrarLista(); vacia = true; return; }
      if (lista && !vacia) { html[html.length - 1] = html[html.length - 1].split("</li>").join("") + "<br>" + enLinea(t) + "</li>"; return; }
      cerrarLista();
      html.push("<p>" + enLinea(t) + "</p>");
      vacia = false;
    });
    cerrarLista();
    return html.join("");
  }

  /** Texto para leer en voz alta: sin marcas y con algunas lecturas más naturales. */
  function paraVoz(texto) {
    var t = String(texto || "").split("**").join("").split("`").join("").split("#").join("");
    t = t.split("US$").join("dólares ").split("U$S").join("dólares ").split("N°").join("número ").split("Nº").join("número ");
    var lineas = t.split("\n").map(function (l) {
      var x = l.trim();
      if (x.indexOf("- ") === 0 || x.indexOf("* ") === 0 || x.indexOf("• ") === 0) x = x.substring(2);
      return x;
    }).filter(Boolean);
    return lineas.map(function (l) {
      var u = l.charAt(l.length - 1);
      return u === "." || u === ":" || u === "?" || u === "!" || u === "," ? l : l + ".";
    }).join(" ");
  }

  /** Corta el texto en partes de hasta ~200 caracteres (Chrome corta los textos largos). */
  function trozos(t) {
    var out = [], actual = "";
    t.split(". ").forEach(function (o, i, todos) {
      var oracion = o + (i < todos.length - 1 ? "." : "");
      if ((actual + " " + oracion).length > 200 && actual) { out.push(actual.trim()); actual = oracion; }
      else actual += " " + oracion;
    });
    if (actual.trim()) out.push(actual.trim());
    return out;
  }

  // ---------------- Servidor ----------------
  function enApp() {
    return typeof runJson === "function" && typeof google !== "undefined" && !!(google.script && google.script.run);
  }

  function pedir(datos) {
    if (enApp()) return runJson("asistente", datos);
    var token = window.BGPSesion ? window.BGPSesion.token() : "";
    var control = typeof AbortController !== "undefined" ? new AbortController() : null;
    var reloj = setTimeout(function () { if (control) control.abort(); }, ESPERA_MS);
    return fetch(URL_APP, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ accion: "asistente", datos: datos, token: token }),
      signal: control ? control.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error("El servidor respondió " + r.status + ".");
      return r.json();
    }, function () {
      throw new Error("No se pudo conectar con el servidor. Revisá la conexión y probá de nuevo.");
    }).then(function (r) {
      clearTimeout(reloj);
      if (r && r.ok !== false) return r;
      var err = new Error((r && r.error) || "Error del servidor.");
      if (r && r.sesion === false) err.sesion = false;
      throw err;
    }, function (err) { clearTimeout(reloj); throw err; });
  }

  // ---------------- Chat ----------------
  function Chat(modo, opciones) {
    var yo = this;
    opciones = opciones || {};
    yo.modo = modo;
    yo.opciones = opciones;
    yo.usuario = opciones.usuario || "";
    yo.mensajes = [];
    yo.ocupado = false;
    yo.estado = null;
    var prefs = {};
    try { prefs = JSON.parse(leer("asis-prefs") || "{}") || {}; } catch (e) {}
    yo.leerSiempre = !!prefs.leerSiempre;
    yo.manosLibres = false;
    yo.cargarGuardados();
    yo.construir();
  }

  Chat.prototype.claveGuardado = function () { return "asis-chat-" + (this.usuario || "anonimo"); };

  Chat.prototype.cargarGuardados = function () {
    try {
      var g = JSON.parse(leer(this.claveGuardado()) || "[]");
      if (Array.isArray(g)) this.mensajes = g.filter(function (m) { return m && (m.rol === "usuario" || m.rol === "asistente") && m.texto; }).slice(-MAX_GUARDADOS);
    } catch (e) { this.mensajes = []; }
  };

  Chat.prototype.guardar = function () {
    var lista = this.mensajes.filter(function (m) { return !m.error; }).slice(-MAX_GUARDADOS);
    escribir(this.claveGuardado(), lista.length ? JSON.stringify(lista) : null);
  };

  Chat.prototype.guardarPrefs = function () {
    escribir("asis-prefs", JSON.stringify({ leerSiempre: this.leerSiempre }));
  };

  Chat.prototype.construir = function () {
    var yo = this;
    yo.nodoTitulo = el("b", "", { texto: "Asistente" });
    yo.nodoEstado = el("span", "", { texto: "Tesorería y propiedades" });
    yo.btnVoz = el("button", "asis-icono", { type: "button", "aria-label": "Leer las respuestas en voz alta", title: "Leer las respuestas en voz alta", "aria-pressed": String(yo.leerSiempre), html: yo.leerSiempre ? ICONOS.parlante : ICONOS.silencio });
    yo.btnManos = el("button", "asis-icono", { type: "button", "aria-label": "Manos libres: escucha de nuevo después de responder", title: "Manos libres", "aria-pressed": "false", html: ICONOS.manos });
    yo.btnNueva = el("button", "asis-icono", { type: "button", "aria-label": "Nueva charla", title: "Nueva charla", html: ICONOS.nueva });
    yo.btnExpandir = el("button", "asis-icono asis-expandir", { type: "button", "aria-label": "Abrir en pantalla completa", title: "Abrir en su página (pantalla completa)", html: ICONOS.expandir });
    yo.btnCerrar = el("button", "asis-icono asis-cerrar", { type: "button", "aria-label": "Cerrar", title: "Cerrar", html: ICONOS.cerrar });
    var cab = el("div", "asis-cab", null, [
      el("div", "asis-avatar", { html: ICONOS.chispa, "aria-hidden": "true" }),
      el("div", "asis-titulo", null, [yo.nodoTitulo, yo.nodoEstado]),
      yo.btnVoz, yo.btnManos, yo.btnNueva, yo.btnExpandir, yo.btnCerrar
    ]);
    yo.lista = el("div", "asis-lista", { role: "log", "aria-live": "polite", "aria-label": "Conversación" });
    yo.aviso = el("div", "asis-aviso");
    yo.aviso.hidden = true;
    yo.textoEscucha = el("span", "", { texto: "Te escucho…" });
    yo.btnPararEscucha = el("button", "asis-icono", { type: "button", "aria-label": "Dejar de escuchar", title: "Dejar de escuchar", html: ICONOS.parar });
    yo.escucha = el("div", "asis-escucha", null, [el("span", "asis-onda", { "aria-hidden": "true", html: "<i></i><i></i><i></i><i></i>" }), yo.textoEscucha, yo.btnPararEscucha]);
    yo.entrada = el("textarea", "", { rows: "1", placeholder: "Preguntá lo que necesites…", "aria-label": "Tu pregunta", enterkeyhint: "send" });
    yo.btnMic = el("button", "asis-boton-redondo asis-mic", { type: "button", "aria-label": "Hablar", title: "Hablar", html: ICONOS.mic });
    yo.btnEnviar = el("button", "asis-boton-redondo asis-enviar", { type: "button", "aria-label": "Enviar", title: "Enviar", html: ICONOS.enviar, disabled: "disabled" });
    var pie = el("div", "asis-pie", null, [
      el("div", "asis-entrada", null, [yo.entrada, yo.btnMic, yo.btnEnviar]),
      el("div", "asis-nota", { texto: "Responde Gemini (Google) con los datos de la app. Puede equivocarse: verificá antes de decidir." })
    ]);
    yo.nodo = el("div", "asis-chat", null, [cab, yo.aviso, yo.lista, el("div", "asis-escucha-caja", null, [yo.escucha]), pie]);

    yo.entrada.addEventListener("input", function () { yo.ajustarEntrada(); });
    yo.entrada.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); yo.enviarEscrito(); }
    });
    yo.btnEnviar.addEventListener("click", function () { yo.enviarEscrito(); });
    yo.btnMic.addEventListener("click", function () {
      prepararVoz();
      if (yo.voz && yo.voz.activa) yo.voz.parar(); else yo.escuchar();
    });
    yo.btnPararEscucha.addEventListener("click", function () { yo.manosLibres = false; yo.pintarManos(); if (yo.voz) yo.voz.cancelar(); });
    yo.btnVoz.addEventListener("click", function () {
      prepararVoz();
      yo.leerSiempre = !yo.leerSiempre;
      if (!yo.leerSiempre) callar();
      yo.btnVoz.setAttribute("aria-pressed", String(yo.leerSiempre));
      yo.btnVoz.innerHTML = yo.leerSiempre ? ICONOS.parlante : ICONOS.silencio;
      yo.guardarPrefs();
    });
    yo.btnManos.addEventListener("click", function () {
      prepararVoz();
      yo.manosLibres = !yo.manosLibres;
      yo.pintarManos();
      if (yo.manosLibres) { if (!yo.ocupado && !hablando()) yo.escuchar(); }
      else { if (yo.voz) yo.voz.cancelar(); }
    });
    yo.btnNueva.addEventListener("click", function () {
      callar();
      if (yo.voz) yo.voz.cancelar();
      yo.mensajes = [];
      yo.guardar();
      yo.pintar();
      yo.entrada.focus();
    });
    yo.btnExpandir.addEventListener("click", function () {
      var w = window.open(PAGINA, "_blank", "noopener");
      if (!w) location.href = PAGINA;
    });
    yo.btnCerrar.addEventListener("click", function () { if (yo.opciones.alCerrar) yo.opciones.alCerrar(); });
    yo.pintar();
  };

  Chat.prototype.pintarManos = function () {
    this.btnManos.setAttribute("aria-pressed", String(this.manosLibres));
    this.ponerEstado();
  };

  Chat.prototype.ponerEstado = function (texto, vivo) {
    var t = texto || (this.manosLibres ? "Manos libres activado" : "Tesorería y propiedades");
    this.nodoEstado.textContent = t;
    this.nodoEstado.className = vivo || (!texto && this.manosLibres) ? "vivo" : "";
  };

  Chat.prototype.ajustarEntrada = function () {
    var e = this.entrada;
    e.style.height = "auto";
    e.style.height = Math.min(e.scrollHeight, 140) + "px";
    if (e.value.trim() && !this.ocupado) this.btnEnviar.removeAttribute("disabled");
    else this.btnEnviar.setAttribute("disabled", "disabled");
  };

  Chat.prototype.iniciar = function () {
    var yo = this;
    if (yo.estado) return;
    yo.estado = { cargando: true };
    pedir({ op: "estado" }).then(function (r) {
      yo.estado = r;
      yo.nodoTitulo.textContent = r.nombre || "Asistente";
      if (!r.configurado) yo.mostrarAviso("Falta activar el asistente: hay que cargar la clave gratuita de Gemini en el servidor (ver ASISTENTE.md en el repositorio).");
      yo.pintar();
    }, function (err) {
      yo.estado = null;
      if (err && err.sesion === false && yo.opciones.alVencer) { yo.opciones.alVencer(); return; }
      yo.mostrarAviso(err.message || "No se pudo conectar con el asistente.");
    });
  };

  Chat.prototype.mostrarAviso = function (t) {
    this.aviso.textContent = t || "";
    this.aviso.hidden = !t;
  };

  Chat.prototype.pintar = function () {
    var yo = this;
    yo.lista.innerHTML = "";
    if (!yo.mensajes.length) {
      var nombre = (yo.estado && yo.estado.nombre) || "";
      var presentacion = !nombre || nombre === "Asistente" ? "tu asistente" : nombre;
      var quien = (yo.estado && yo.estado.usuario) ? ", " + yo.estado.usuario.split(" ")[0] : "";
      var sug = el("div", "asis-sugerencias");
      ((yo.estado && yo.estado.sugerencias) || []).forEach(function (s) {
        var b = el("button", "asis-sugerencia", { type: "button", texto: s });
        b.addEventListener("click", function () { yo.enviar(s, "texto"); });
        sug.appendChild(b);
      });
      yo.lista.appendChild(el("div", "asis-bienvenida", null, [
        el("div", "asis-avatar", { html: ICONOS.chispa, "aria-hidden": "true" }),
        el("h3", "", { texto: "Hola" + quien + ". Soy " + presentacion + "." }),
        el("p", "", { texto: "Preguntame por saldos, cheques, vencimientos, movimientos, facturas o propiedades. Podés escribir o tocar el micrófono y hablar." }),
        sug
      ]));
      return;
    }
    yo.mensajes.forEach(function (m) { yo.lista.appendChild(yo.nodoMensaje(m)); });
    yo.bajar();
  };

  Chat.prototype.nodoMensaje = function (m) {
    var yo = this;
    if (m.error) {
      var n = el("div", "asis-msg error", { html: esc(m.texto) });
      if (m.enlace) {
        var a = el("a", "", { href: PAGINA, target: "_blank", rel: "noopener", texto: "Abrir el asistente en su página" });
        n.appendChild(document.createTextNode(" "));
        n.appendChild(a);
      }
      return n;
    }
    if (m.rol === "usuario") return el("div", "asis-msg usuario", { texto: m.texto });
    var nodo = el("div", "asis-msg asistente" + (m.alerta ? " alerta" : ""), { html: aHtml(m.texto) });
    if (m.alerta) nodo.insertBefore(el("div", "asis-etiqueta", { texto: "Revisión automática" }), nodo.firstChild);
    var meta = el("div", "asis-meta");
    if (m.consultas && m.consultas.length) {
      var vistas = [];
      m.consultas.forEach(function (c) { var t = NOMBRES_CONSULTA[c] || c; if (vistas.indexOf(t) < 0) vistas.push(t); });
      meta.appendChild(el("span", "", { texto: "Consultó: " + vistas.join(" · ") }));
    }
    if ("speechSynthesis" in window) {
      var escuchar = el("button", "", { type: "button", texto: "Escuchar" });
      escuchar.addEventListener("click", function () { prepararVoz(); yo.leerEnVoz(m.texto, false); });
      meta.appendChild(escuchar);
    }
    if (navigator.clipboard) {
      var copiar = el("button", "", { type: "button", texto: "Copiar" });
      copiar.addEventListener("click", function () {
        navigator.clipboard.writeText(paraCopiar(m.texto)).then(function () { copiar.textContent = "Copiado"; setTimeout(function () { copiar.textContent = "Copiar"; }, 1500); }, function () {});
      });
      meta.appendChild(copiar);
    }
    if (meta.childNodes.length) nodo.appendChild(meta);
    return nodo;
  };

  function paraCopiar(t) { return String(t || "").split("**").join(""); }

  Chat.prototype.bajar = function () {
    var l = this.lista;
    requestAnimationFrame(function () { l.scrollTop = l.scrollHeight; });
  };

  Chat.prototype.agregar = function (m) {
    if (!this.mensajes.length) this.lista.innerHTML = "";
    this.mensajes.push(m);
    this.lista.appendChild(this.nodoMensaje(m));
    this.guardar();
    this.bajar();
  };

  Chat.prototype.enviarEscrito = function () {
    var t = this.entrada.value.trim();
    if (!t || this.ocupado) return;
    this.entrada.value = "";
    this.ajustarEntrada();
    this.enviar(t, "texto");
  };

  Chat.prototype.historial = function () {
    return this.mensajes.filter(function (m) { return !m.error; }).slice(-MAX_HISTORIAL).map(function (m) { return { rol: m.rol, texto: m.texto }; });
  };

  /**
   * Aviso de la revisión (r: respuesta de op "revisar" con avisos nuevos): queda como
   * mensaje del asistente, así la respuesta del usuario ("fue un rescate") llega a
   * Gemini con el aviso en el historial. Se marca como visto para no repetirlo.
   */
  Chat.prototype.mostrarAlerta = function (r, hablar) {
    if (!r || !r.mensaje) return;
    this.agregar({ rol: "asistente", texto: r.mensaje, alerta: true });
    if (hablar) { prepararVoz(); this.leerEnVoz(r.voz || r.mensaje, false); }
    pedir({ op: "visto", ids: r.nuevos || [] }).then(null, function () {});
  };

  /** texto: la pregunta; canal: 'texto' | 'voz'; audio: {mime, base64} si se grabó. */
  Chat.prototype.enviar = function (texto, canal, audio) {
    var yo = this;
    if (yo.ocupado) return;
    callar();
    var limpio = String(texto || "").trim();
    if (!limpio && !audio) return;

    // "Listo", "gracias", "chau": cierra el modo manos libres sin gastar una consulta.
    if (canal === "voz" && yo.manosLibres && limpio && PALABRAS_FIN.indexOf(frase(limpio)) >= 0) {
      yo.manosLibres = false;
      yo.pintarManos();
      yo.leerEnVoz("De nada. Cuando me necesites, tocá el micrófono.", false);
      return;
    }

    var historial = yo.historial();
    var mensajeUsuario = { rol: "usuario", texto: limpio || "🎤 Audio" };
    yo.agregar(mensajeUsuario);
    yo.ocupado = true;
    yo.ajustarEntrada();
    var pensando = el("div", "asis-pensando", { "aria-label": "Pensando", html: "<i></i><i></i><i></i>" });
    yo.lista.appendChild(pensando);
    yo.bajar();
    yo.ponerEstado("Pensando…", true);
    var datos = { op: "preguntar", mensaje: limpio, historial: historial, canal: canal === "voz" ? "voz" : "texto" };
    if (audio) datos.audio = audio;
    pedir(datos).then(function (r) {
      pensando.remove();
      if (audio && r.transcripcion !== undefined) {
        mensajeUsuario.texto = r.transcripcion || "🎤 (no se entendió el audio)";
        yo.pintar();
      }
      var m = { rol: "asistente", texto: r.respuesta || "", consultas: r.consultas || [] };
      yo.agregar(m);
      yo.ocupado = false;
      yo.ajustarEntrada();
      yo.ponerEstado();
      if (canal === "voz" || yo.leerSiempre) yo.leerEnVoz(m.texto, yo.manosLibres);
    }, function (err) {
      pensando.remove();
      yo.ocupado = false;
      yo.ajustarEntrada();
      yo.ponerEstado();
      if (err && err.sesion === false && yo.opciones.alVencer) { yo.opciones.alVencer(); return; }
      // La pregunta que falló no queda en el historial (así se puede repetir).
      yo.mensajes = yo.mensajes.filter(function (x) { return x !== mensajeUsuario; });
      yo.guardar();
      yo.agregar({ rol: "asistente", error: true, texto: (err && err.message) || "No se pudo responder." });
      if (!limpio && !audio) return;
      if (canal === "texto" && limpio) { yo.entrada.value = limpio; yo.ajustarEntrada(); }
      if (yo.manosLibres) { yo.manosLibres = false; yo.pintarManos(); }
    });
  };

  // ---------------- Voz: hablar ----------------
  var vozElegida = null;
  var hablandoAhora = false;

  function elegirVoz() {
    if (!("speechSynthesis" in window)) return null;
    var voces = speechSynthesis.getVoices() || [];
    var orden = ["es-ar", "es-419", "es-us", "es-mx", "es-es", "es"];
    for (var i = 0; i < orden.length; i++) {
      var cand = voces.filter(function (v) { return String(v.lang || "").toLowerCase().split("_").join("-").indexOf(orden[i]) === 0; });
      if (cand.length) {
        // Entre las del mismo idioma, mejor las "naturales" o de Google.
        cand.sort(function (a, b) { return puntaje(b) - puntaje(a); });
        return cand[0];
      }
    }
    return null;
  }

  function puntaje(v) {
    var n = sinTildes(v.name);
    return (n.indexOf("natural") >= 0 ? 3 : 0) + (n.indexOf("google") >= 0 ? 2 : 0) + (n.indexOf("enhanced") >= 0 || n.indexOf("premium") >= 0 ? 2 : 0) + (v.localService ? 0 : 1);
  }

  if ("speechSynthesis" in window) {
    vozElegida = elegirVoz();
    try { speechSynthesis.addEventListener("voiceschanged", function () { vozElegida = elegirVoz(); }); } catch (e) {}
  }

  var vozPreparada = false;
  // iOS solo deja hablar si la primera vez es dentro de un toque del usuario.
  function prepararVoz() {
    if (vozPreparada || !("speechSynthesis" in window)) return;
    vozPreparada = true;
    try { var u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
  }

  function hablando() { return hablandoAhora; }

  function callar() {
    hablandoAhora = false;
    try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch (e) {}
  }

  Chat.prototype.leerEnVoz = function (texto, escucharDespues) {
    var yo = this;
    if (!("speechSynthesis" in window)) { if (escucharDespues) yo.escuchar(); return; }
    callar();
    var partes = trozos(paraVoz(texto));
    if (!partes.length) return;
    hablandoAhora = true;
    yo.ponerEstado("Hablando… (tocá el micrófono para interrumpir)", true);
    var terminado = false;
    function fin() {
      if (terminado) return;
      terminado = true;
      hablandoAhora = false;
      yo.ponerEstado();
      if (escucharDespues && yo.manosLibres) setTimeout(function () { if (yo.manosLibres && !yo.ocupado) yo.escuchar(); }, 300);
    }
    partes.forEach(function (p, i) {
      var u = new SpeechSynthesisUtterance(p);
      u.lang = vozElegida ? vozElegida.lang : "es-AR";
      if (vozElegida) u.voice = vozElegida;
      u.rate = 1.05;
      if (i === partes.length - 1) u.onend = fin;
      u.onerror = function (e) { if (!e || e.error !== "interrupted") fin(); };
      speechSynthesis.speak(u);
    });
    // Respaldo por si el navegador no avisa que terminó.
    setTimeout(function () { if (!speechSynthesis.speaking) fin(); }, 1500);
  };

  // ---------------- Voz: escuchar ----------------
  var Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;

  function puedeGrabar() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== "undefined");
  }

  Chat.prototype.escuchar = function () {
    var yo = this;
    if (yo.ocupado) return;
    callar();
    if (yo.voz && yo.voz.activa) return;
    if (Reconocedor) yo.voz = new Dictado(yo);
    else if (puedeGrabar()) yo.voz = new Grabacion(yo);
    else {
      yo.agregar({ rol: "asistente", error: true, texto: "Este navegador no permite hablar con el asistente. Probá con Chrome, Edge o Safari, o usá el micrófono del teclado del celular." });
      return;
    }
    yo.voz.iniciar();
  };

  Chat.prototype.estadoEscucha = function (activa, texto) {
    this.escucha.classList.toggle("activa", !!activa);
    this.btnMic.classList.toggle("escuchando", !!activa);
    this.btnMic.innerHTML = activa ? ICONOS.parar : ICONOS.mic;
    this.btnMic.setAttribute("aria-label", activa ? "Terminar de hablar" : "Hablar");
    this.textoEscucha.textContent = texto || "Te escucho…";
    if (activa) this.ponerEstado("Escuchando…", true); else if (!this.ocupado && !hablando()) this.ponerEstado();
  };

  Chat.prototype.sinPermisoMic = function () {
    this.manosLibres = false;
    this.pintarManos();
    var dentro = this.modo === "flotante";
    this.agregar({
      rol: "asistente", error: true, enlace: dentro,
      texto: dentro
        ? "No tengo permiso para usar el micrófono dentro de la app. Permitilo en el candado de la barra de direcciones o, más fácil, usá la voz en la página del asistente."
        : "No tengo permiso para usar el micrófono. Permitilo en el candado de la barra de direcciones (o en los ajustes del navegador) y probá de nuevo."
    });
  };

  // Dictado con el reconocimiento de voz del navegador.
  function Dictado(chat) { this.chat = chat; this.activa = false; this.cancelado = false; }

  Dictado.prototype.iniciar = function () {
    var yo = this, chat = yo.chat;
    var rec;
    try { rec = new Reconocedor(); } catch (e) { chat.agregar({ rol: "asistente", error: true, texto: "No se pudo iniciar el micrófono." }); return; }
    yo.rec = rec;
    rec.lang = "es-AR";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    var final = "", parcial = "", error = "";
    rec.onresult = function (e) {
      parcial = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else parcial += t;
      }
      chat.estadoEscucha(true, (final + " " + parcial).trim() || "Te escucho…");
    };
    rec.onerror = function (e) { error = (e && e.error) || "error"; };
    rec.onend = function () {
      yo.activa = false;
      chat.estadoEscucha(false);
      if (yo.cancelado) return;
      var texto = (final || parcial).trim();
      if (texto) { chat.enviar(texto, "voz"); return; }
      if (error === "not-allowed" || error === "service-not-allowed") { chat.sinPermisoMic(); return; }
      if (error === "network") { chat.agregar({ rol: "asistente", error: true, texto: "El dictado necesita internet y no pudo conectarse. Probá de nuevo." }); return; }
      if (error === "audio-capture") { chat.agregar({ rol: "asistente", error: true, texto: "No encontré un micrófono en este dispositivo." }); return; }
      // No dijo nada: en manos libres se pausa para no quedar escuchando para siempre.
      if (chat.manosLibres) { chat.manosLibres = false; chat.pintarManos(); chat.ponerEstado("Manos libres en pausa: no te escuché", true); }
    };
    try {
      rec.start();
      yo.activa = true;
      chat.estadoEscucha(true);
    } catch (e) {
      yo.activa = false;
      chat.estadoEscucha(false);
    }
  };

  Dictado.prototype.parar = function () { if (this.rec && this.activa) { try { this.rec.stop(); } catch (e) {} } };
  Dictado.prototype.cancelar = function () { this.cancelado = true; if (this.rec) { try { this.rec.abort(); } catch (e) {} } this.activa = false; this.chat.estadoEscucha(false); };

  // Grabación (navegadores sin dictado, por ejemplo Firefox): el audio lo transcribe Gemini.
  function Grabacion(chat) { this.chat = chat; this.activa = false; this.cancelado = false; }

  Grabacion.prototype.iniciar = function () {
    var yo = this, chat = yo.chat;
    yo.activa = true;
    chat.estadoEscucha(true, "Grabando… tocá ■ cuando termines");
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      if (yo.cancelado) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      yo.stream = stream;
      var tipos = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      var tipo = "";
      for (var i = 0; i < tipos.length; i++) { if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(tipos[i])) { tipo = tipos[i]; break; } }
      var mr = tipo ? new MediaRecorder(stream, { mimeType: tipo }) : new MediaRecorder(stream);
      yo.mr = mr;
      var partes = [];
      mr.ondataavailable = function (e) { if (e.data && e.data.size) partes.push(e.data); };
      mr.onstop = function () {
        yo.limpiar();
        if (yo.cancelado || !partes.length) return;
        var blob = new Blob(partes, { type: mr.mimeType || tipo || "audio/webm" });
        var lector = new FileReader();
        lector.onload = function () {
          var s = String(lector.result || "");
          var coma = s.indexOf(",");
          chat.enviar("", "voz", { mime: blob.type || tipo, base64: coma >= 0 ? s.substring(coma + 1) : s });
        };
        lector.readAsDataURL(blob);
      };
      mr.start();
      yo.vigilarSilencio(stream);
      yo.reloj = setTimeout(function () { yo.parar(); }, GRABACION_MAX_MS);
    }, function () {
      yo.activa = false;
      chat.estadoEscucha(false);
      chat.sinPermisoMic();
    });
  };

  // Corta sola cuando hubo voz y después ~1,6 s de silencio.
  Grabacion.prototype.vigilarSilencio = function (stream) {
    var yo = this;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      var ctx = new Ctx();
      yo.ctx = ctx;
      var fuente = ctx.createMediaStreamSource(stream);
      var analizador = ctx.createAnalyser();
      analizador.fftSize = 1024;
      fuente.connect(analizador);
      var datos = new Uint8Array(analizador.fftSize);
      var huboVoz = false, ultimaVoz = Date.now();
      yo.intervalo = setInterval(function () {
        analizador.getByteTimeDomainData(datos);
        var suma = 0;
        for (var i = 0; i < datos.length; i++) { var v = (datos[i] - 128) / 128; suma += v * v; }
        var nivel = Math.sqrt(suma / datos.length);
        if (nivel > 0.04) { huboVoz = true; ultimaVoz = Date.now(); }
        else if (huboVoz && Date.now() - ultimaVoz > 1600) yo.parar();
      }, 120);
    } catch (e) {}
  };

  Grabacion.prototype.limpiar = function () {
    clearTimeout(this.reloj);
    clearInterval(this.intervalo);
    if (this.ctx) { try { this.ctx.close(); } catch (e) {} this.ctx = null; }
    if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    this.activa = false;
    this.chat.estadoEscucha(false);
  };

  Grabacion.prototype.parar = function () {
    if (this.mr && this.mr.state !== "inactive") { try { this.mr.stop(); } catch (e) { this.limpiar(); } }
    else this.limpiar();
  };

  Grabacion.prototype.cancelar = function () { this.cancelado = true; this.parar(); };

  // ---------------- Montaje ----------------
  function ponerEstilos() {
    if (document.getElementById("asis-estilos")) return;
    var s = document.createElement("style");
    s.id = "asis-estilos";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  var flotante = null;

  /** Botón flotante dentro de la app: aparece solo con la sesión iniciada. */
  function iniciarFlotante() {
    ponerEstilos();
    var raiz = el("div", "flotante", { id: "asis-raiz" });
    var fab = el("button", "asis-fab", { type: "button", "aria-label": "Abrir el asistente", title: "Asistente (texto y voz)", html: ICONOS.chispa });
    var panel = el("div", "asis-panel", { role: "dialog", "aria-label": "Asistente", "aria-modal": "false" });
    var insignia = el("span", "asis-insignia", { "aria-hidden": "true" });
    insignia.hidden = true;
    fab.appendChild(insignia);
    var burbujaTexto = el("button", "asis-burbuja-texto", { type: "button" });
    var burbujaCerrar = el("button", "asis-icono", { type: "button", "aria-label": "Más tarde", title: "Más tarde", html: ICONOS.cerrar });
    var burbuja = el("div", "asis-burbuja", { role: "status" }, [burbujaTexto, burbujaCerrar]);
    burbuja.hidden = true;
    raiz.appendChild(burbuja);
    raiz.appendChild(fab);
    raiz.appendChild(panel);
    raiz.hidden = true;
    document.body.appendChild(raiz);
    flotante = { raiz: raiz, panel: panel, chat: null, usuario: "", fab: fab, insignia: insignia, burbuja: burbuja, burbujaTexto: burbujaTexto, aviso: null, burbujaCerrada: "", nombre: "" };

    fab.addEventListener("click", function () { abrir(); });
    burbujaTexto.addEventListener("click", function () { abrir(); });
    burbujaCerrar.addEventListener("click", function () {
      // Queda la insignia en el botón; el globito vuelve con el próximo aviso distinto.
      if (flotante.aviso) flotante.burbujaCerrada = flotante.aviso.nuevos.join(",");
      pintarAviso();
    });
    engancharApp();
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && raiz.classList.contains("abierto")) cerrar();
    });

    // La app guarda el usuario con sesión en "usuarioActual" (Index.html).
    function revisar() {
      var u = null;
      try { u = typeof usuarioActual !== "undefined" && usuarioActual ? usuarioActual : null; } catch (e) { u = null; }
      var nombre = u ? String(u.usuario || u.nombre || "usuario") : "";
      if (nombre !== flotante.usuario) {
        flotante.usuario = nombre;
        cerrar();
        callar();
        if (flotante.chat && flotante.chat.voz) flotante.chat.voz.cancelar();
        panel.innerHTML = "";
        flotante.chat = null;
        flotante.aviso = null;
        flotante.burbujaCerrada = "";
        pintarAviso();
        // Revisión al entrar: con avisos nuevos aparece el globito (sin abrir ni hablar: todavía no hubo un toque).
        if (nombre) setTimeout(function () { if (flotante.usuario === nombre) revisarAvisos("inicio"); }, 2500);
      }
      raiz.hidden = !nombre;
    }
    revisar();
    setInterval(revisar, 1500);
  }

  function abrir() {
    if (!flotante || !flotante.usuario) return;
    if (!flotante.chat) {
      flotante.chat = new Chat("flotante", { usuario: flotante.usuario, alCerrar: cerrar });
      flotante.panel.appendChild(flotante.chat.nodo);
    }
    flotante.raiz.classList.add("abierto");
    flotante.chat.iniciar();
    entregarAviso();
    setTimeout(function () { try { flotante.chat.entrada.focus({ preventScroll: true }); } catch (e) {} }, 220);
  }

  function cerrar() {
    if (!flotante) return;
    flotante.raiz.classList.remove("abierto");
    if (flotante.chat) {
      if (flotante.chat.voz && flotante.chat.voz.activa) flotante.chat.voz.cancelar();
      flotante.chat.manosLibres = false;
      flotante.chat.pintarManos();
      callar();
    }
    pintarAviso();
  }

  // ---------------- Avisos de la revisión (dentro de la app) ----------------
  var revisionProgramada = null, motivoRevision = "", revisando = false;

  /**
   * Envuelve runJson de la app: cuando una acción que cambia saldos, movimientos,
   * cheques o compromisos sale bien, se vuelve a revisar. Así no hace falta tocar
   * cada pantalla de Index.html.
   */
  function engancharApp() {
    if (typeof window.runJson !== "function" || window.runJson.asistente) return;
    var original = window.runJson;
    var envuelta = function (accion) {
      var p = original.apply(this, arguments);
      if (ACCIONES_QUE_CAMBIAN.indexOf(accion) >= 0 && p && typeof p.then === "function") {
        p.then(function () { programarRevision(ACCIONES_DE_SALDOS.indexOf(accion) >= 0 ? "saldos" : "cambio"); }, function () {});
      }
      return p;
    };
    envuelta.asistente = true;
    window.runJson = envuelta;
  }

  /** Espera un momento (una carga suele mandar varias acciones seguidas) y revisa una sola vez. */
  function programarRevision(motivo) {
    if (motivo === "saldos" || !motivoRevision) motivoRevision = motivo;
    clearTimeout(revisionProgramada);
    revisionProgramada = setTimeout(function () {
      if (revisando) { programarRevision(motivoRevision); return; }
      var m = motivoRevision;
      motivoRevision = "";
      revisarAvisos(m);
    }, 1500);
  }

  /** motivo: "inicio" (al entrar), "saldos" (se acaban de guardar saldos) o "cambio". */
  function revisarAvisos(motivo) {
    if (!flotante || !flotante.usuario || revisando) return;
    revisando = true;
    var usuario = flotante.usuario;
    pedir({ op: "revisar" }).then(function (r) {
      revisando = false;
      if (!flotante || flotante.usuario !== usuario) return;
      if (r && r.nombre) flotante.nombre = r.nombre;
      flotante.aviso = r && r.mensaje && r.nuevos && r.nuevos.length ? r : null;
      pintarAviso();
      // Después de guardar saldos hubo un toque reciente: se puede abrir y hablar.
      if (flotante.aviso && (motivo === "saldos" || flotante.raiz.classList.contains("abierto"))) abrir();
    }, function () { revisando = false; });
  }

  function pintarAviso() {
    if (!flotante) return;
    var a = flotante.aviso;
    var n = a ? a.nuevos.length : 0;
    flotante.insignia.textContent = n ? String(n) : "";
    flotante.insignia.hidden = !n;
    flotante.fab.classList.toggle("con-aviso", !!n);
    flotante.fab.setAttribute("aria-label", n ? "Abrir el asistente: " + n + (n === 1 ? " aviso" : " avisos") : "Abrir el asistente");
    var abierto = flotante.raiz.classList.contains("abierto");
    var mostrar = !!n && !abierto && flotante.burbujaCerrada !== a.nuevos.join(",");
    if (mostrar) {
      var nombre = flotante.nombre || "Asistente";
      flotante.burbujaTexto.innerHTML = "<b>" + esc(nombre) + ":</b> " +
        (n === 1 ? "hay algo que no me cuadra" + (a.resumen ? " (" + esc(a.resumen) + ")" : "") + "." : "hay " + n + " cosas que no me cuadran.") + " ¿Lo vemos?";
    }
    flotante.burbuja.hidden = !mostrar;
  }

  /** Pasa el aviso pendiente al chat abierto y lo lee en voz alta. */
  function entregarAviso() {
    if (!flotante || !flotante.aviso || !flotante.chat || flotante.chat.ocupado) return;
    var r = flotante.aviso;
    flotante.aviso = null;
    flotante.burbujaCerrada = "";
    pintarAviso();
    flotante.chat.mostrarAlerta(r, true);
  }

  /** Página propia (bgpsammar.com/asistente/). opciones: {usuario, alVencer}. */
  function montarPagina(contenedor, opciones) {
    ponerEstilos();
    contenedor.innerHTML = "";
    var raiz = el("div", "pagina", { id: "asis-raiz" });
    var chat = new Chat("pagina", opciones || {});
    raiz.appendChild(chat.nodo);
    contenedor.appendChild(raiz);
    chat.iniciar();
    // Si hay avisos nuevos, el chat arranca con ellos (la voz suena si el navegador lo permite).
    pedir({ op: "revisar" }).then(function (r) {
      if (r && r.mensaje && r.nuevos && r.nuevos.length && !chat.ocupado && raiz.isConnected) chat.mostrarAlerta(r, true);
    }, function () {});
    return chat;
  }

  window.Asistente = { abrir: abrir, cerrar: cerrar, montarPagina: montarPagina, _aHtml: aHtml, _paraVoz: paraVoz };

  function arrancar() { if (enApp()) iniciarFlotante(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
