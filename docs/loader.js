/*
 * Pantalla de carga · B.G.P Sammar Tesorería
 * Uso:
 *   var carga = BGPLoader.create(contenedor, { duracion: 7000, alTerminar: function () {} });
 *   carga.reiniciar();          // vuelve a 0 %
 *   carga.estado("Texto");      // fija el mensaje de estado
 *   carga.destroy();            // la quita del DOM
 */
(function (global) {
  "use strict";

  var ESTADOS = [
    [0, "Conectando con la planilla de tesorería"],
    [0.2, "Sincronizando cuentas y saldos"],
    [0.42, "Leyendo cheques y vencimientos"],
    [0.64, "Proyectando el flujo de fondos"],
    [0.86, "Preparando el panel"],
    [1, "Tesorería lista"]
  ];
  var PILARES = [0.06, 0.16, 0.26];
  var X0 = 24, X1 = 736, ESCALA = 0.9;

  // Silueta de la pickup (vista lateral, el piso de las ruedas está en y = 0).
  var CUERPO = "M -82 -42 L -12 -42 L -8 -44 L -2 -61 Q 1 -66 7 -66 L 30 -66 Q 36 -66 40 -61 L 53 -45 L 75 -41 Q 82 -40 82 -34 L 82 -18 Q 82 -14 78 -14 L -78 -14 Q -82 -14 -82 -18 Z";

  function tendY(t) { return 280 - 160 * t - 14 * Math.sin(3.2 * Math.PI * t); }
  function tendX(t) { return X0 + (X1 - X0) * t; }
  function suave(p) { return 0.5 - 0.5 * Math.cos(Math.PI * p); }

  // Largo acumulado de la línea, para que el trazo termine justo debajo de la camioneta.
  var N = 240, LARGOS = [0];
  for (var i = 1; i <= N; i++) {
    var a = (i - 1) / N, b = i / N;
    LARGOS.push(LARGOS[i - 1] + Math.hypot(tendX(b) - tendX(a), tendY(b) - tendY(a)));
  }
  function fraccionLargo(t) {
    var k = t * N, j = Math.floor(k);
    if (j >= N) return 1;
    return (LARGOS[j] + (LARGOS[j + 1] - LARGOS[j]) * (k - j)) / LARGOS[N];
  }

  function rutaTendencia() {
    var d = "";
    for (var k = 0; k <= N; k++) {
      var t = k / N;
      d += (k ? " L " : "M ") + tendX(t).toFixed(1) + " " + tendY(t).toFixed(1);
    }
    return d;
  }

  function velas() {
    var semilla = 7;
    var azar = function () { semilla = (semilla * 9301 + 49297) % 233280; return semilla / 233280; };
    var html = "";
    for (var k = 0; k < 24; k++) {
      var t = (k + 0.5) / 24, x = tendX(t), c = tendY(t) - 6;
      var sube = azar() > 0.27;
      var alto = 10 + azar() * 18;
      var arriba = c - alto / 2, abajo = c + alto / 2;
      var m1 = arriba - 4 - azar() * 10, m2 = abajo + 4 + azar() * 10;
      var color = sube ? "#2fd38a" : "#e2556b";
      html += '<line x1="' + x.toFixed(1) + '" y1="' + m1.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + m2.toFixed(1) +
        '" stroke="' + color + '" stroke-width="1.4" opacity=".7"/>' +
        '<rect x="' + (x - 6).toFixed(1) + '" y="' + arriba.toFixed(1) + '" width="12" height="' + alto.toFixed(1) +
        '" rx="1.5" fill="' + color + '" fill-opacity="' + (sube ? ".55" : ".45") + '" stroke="' + color + '" stroke-width="1"/>';
    }
    return html;
  }

  function grilla() {
    var html = "", valores = ["1.940", "1.700", "1.460", "1.220", "980"];
    for (var k = 0; k < 5; k++) {
      var y = 60 + k * 60;
      html += '<line x1="0" x2="752" y1="' + y + '" y2="' + y + '" class="bgp-g-linea"/>' +
        '<text x="796" y="' + (y + 3.5) + '" text-anchor="end" class="bgp-g-texto">' + valores[k] + '</text>';
    }
    for (var x = 80; x < 752; x += 96) html += '<line x1="' + x + '" x2="' + x + '" y1="40" y2="300" class="bgp-g-linea bgp-g-v"/>';
    html += '<text x="0" y="28" class="bgp-g-texto bgp-g-titulo">FONDOS CONSOLIDADOS · ÍNDICE ARS</text>';
    return html;
  }

  function rueda(x) {
    var rayos = "";
    for (var k = 0; k < 5; k++) {
      var ang = k * 72 * Math.PI / 180;
      rayos += '<line x1="' + (2.6 * Math.cos(ang)).toFixed(2) + '" y1="' + (2.6 * Math.sin(ang)).toFixed(2) +
        '" x2="' + (8 * Math.cos(ang)).toFixed(2) + '" y2="' + (8 * Math.sin(ang)).toFixed(2) + '"/>';
    }
    return '<g class="bgp-rueda" data-x="' + x + '" transform="translate(' + x + ' -15)">' +
      '<circle r="15" fill="#0f141d"/><circle r="13.6" fill="none" stroke="#2a313d" stroke-width="2.4"/>' +
      '<circle r="9" fill="url(#bgp-llanta)"/><g stroke="#4f5a6b" stroke-width="2" stroke-linecap="round">' + rayos + '</g>' +
      '<circle r="2.4" fill="#2a313d"/></g>';
  }

  var ICONOS = {
    bolsas: '<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke-linecap="round">' +
      '<line x1="12" y1="12" x2="12" y2="38" stroke="#e2556b" stroke-width="1.8"/><rect x="8" y="18" width="8" height="13" rx="1.6" fill="#e2556b"/>' +
      '<line x1="24" y1="8" x2="24" y2="34" stroke="#2fd38a" stroke-width="1.8"/><rect x="20" y="13" width="8" height="15" rx="1.6" fill="#2fd38a"/>' +
      '<line x1="36" y1="4" x2="36" y2="27" stroke="#2fd38a" stroke-width="1.8"/><rect x="32" y="7" width="8" height="15" rx="1.6" fill="#2fd38a"/>' +
      '<path d="M6 42 H42" stroke="#c9d3e0" stroke-opacity=".55" stroke-width="1.6"/></g></svg>',
    granos: '<svg viewBox="0 0 48 48" aria-hidden="true">' +
      '<path d="M7 19 Q13.5 9 20 19 V42 H7 Z" fill="#c3cdda"/><path d="M15 12 Q18.5 14 20 19 V42 H15 Z" fill="#8d98a8"/>' +
      '<path d="M7 26 H20 M7 33 H20" stroke="#4f5a6b" stroke-width="1.2"/>' +
      '<path d="M33 44 C33 34 33 24 34 12" stroke="#d8b36a" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
      '<g fill="#e3c27a">' +
      '<ellipse cx="30.6" cy="15" rx="2.4" ry="4.2" transform="rotate(-28 30.6 15)"/><ellipse cx="37.2" cy="15" rx="2.4" ry="4.2" transform="rotate(28 37.2 15)"/>' +
      '<ellipse cx="30.4" cy="21" rx="2.4" ry="4.2" transform="rotate(-28 30.4 21)"/><ellipse cx="36.8" cy="21" rx="2.4" ry="4.2" transform="rotate(28 36.8 21)"/>' +
      '<ellipse cx="30.2" cy="27" rx="2.4" ry="4.2" transform="rotate(-28 30.2 27)"/><ellipse cx="36.4" cy="27" rx="2.4" ry="4.2" transform="rotate(28 36.4 27)"/>' +
      '<ellipse cx="34" cy="9" rx="2.2" ry="4"/></g>' +
      '<path d="M33 39 Q40 35 43 28 Q36 31 33 35 Z" fill="#4fbf7a"/>' +
      '<path d="M4 42 H44" stroke="#c9d3e0" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/></svg>',
    propiedades: '<svg viewBox="0 0 48 48" aria-hidden="true">' +
      '<path d="M9 42 V14 L23 8 V42 Z" fill="#c3cdda"/><path d="M23 42 V8 L29 11 V42 Z" fill="#7d8aa0"/>' +
      '<path d="M29 42 V22 L38 20 V42 Z" fill="#9aa6b6"/><path d="M38 42 V20 L41 21.5 V42 Z" fill="#5b6676"/>' +
      '<g fill="#1b2a44">' +
      '<rect x="12" y="16" width="3" height="3"/><rect x="17.5" y="15" width="3" height="3"/>' +
      '<rect x="12" y="22" width="3" height="3"/><rect x="17.5" y="22" width="3" height="3"/>' +
      '<rect x="12" y="28" width="3" height="3"/><rect x="17.5" y="28" width="3" height="3"/>' +
      '<rect x="12" y="34" width="3" height="3"/><rect x="17.5" y="34" width="3" height="3"/>' +
      '<rect x="31.5" y="25" width="2.6" height="2.6"/><rect x="34.8" y="25" width="2.6" height="2.6"/>' +
      '<rect x="31.5" y="31" width="2.6" height="2.6"/><rect x="34.8" y="31" width="2.6" height="2.6"/></g>' +
      '<path d="M5 42 H43" stroke="#d8b36a" stroke-width="1.6" stroke-linecap="round"/></svg>'
  };

  function pilar(clave, nombre) {
    return '<div class="bgp-pilar"><div class="bgp-vidrio">' + ICONOS[clave] + '</div>' +
      '<div class="bgp-sombra" aria-hidden="true"></div><span>' + nombre + '</span></div>';
  }

  function plantilla() {
    return '' +
      '<div class="bgp-fondo" aria-hidden="true"></div>' +
      '<div class="bgp-contenido">' +
        '<header class="bgp-marca">' +
          '<div class="bgp-regla" aria-hidden="true"></div>' +
          '<h1 class="bgp-nombre">B<i>.</i>G<i>.</i>P <span>SAMMAR</span></h1>' +
          '<p class="bgp-sub"><span>Bolsas · Granos · Propiedades</span><span class="bgp-sep" aria-hidden="true"></span><b>Tesorería</b></p>' +
        '</header>' +
        '<section class="bgp-panel">' +
          '<div class="bgp-pilares">' + pilar("bolsas", "Bolsas") + pilar("granos", "Granos") + pilar("propiedades", "Propiedades") + '</div>' +
          '<svg class="bgp-escena" viewBox="0 0 800 320" aria-hidden="true">' +
            '<defs>' +
              '<linearGradient id="bgp-carroceria" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3f6fa"/><stop offset=".35" stop-color="#c5cdd8"/><stop offset=".62" stop-color="#8d98a8"/><stop offset="1" stop-color="#4a5464"/></linearGradient>' +
              '<linearGradient id="bgp-vidrio-auto" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6c8cb8"/><stop offset=".45" stop-color="#1b2a44"/><stop offset="1" stop-color="#0d1626"/></linearGradient>' +
              '<radialGradient id="bgp-llanta"><stop offset="0" stop-color="#eef2f7"/><stop offset=".7" stop-color="#9aa5b5"/><stop offset="1" stop-color="#4b5565"/></radialGradient>' +
              '<linearGradient id="bgp-traza-g" x1="0" x2="1"><stop offset="0" stop-color="#2fd38a"/><stop offset=".7" stop-color="#8be3b8"/><stop offset="1" stop-color="#d8b36a"/></linearGradient>' +
              '<linearGradient id="bgp-area-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fd38a" stop-opacity=".22"/><stop offset="1" stop-color="#2fd38a" stop-opacity="0"/></linearGradient>' +
              '<linearGradient id="bgp-brillo" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
              '<linearGradient id="bgp-reflejo-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".4"/></linearGradient>' +
              '<mask id="bgp-reflejo" maskContentUnits="userSpaceOnUse"><rect x="-100" y="-70" width="200" height="70" fill="url(#bgp-reflejo-g)"/></mask>' +
              '<filter id="bgp-desenfoque" x="-50%" y="-300%" width="200%" height="700%"><feGaussianBlur stdDeviation="5"/></filter>' +
              '<filter id="bgp-resplandor" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>' +
              '<clipPath id="bgp-revela"><rect class="bgp-revela-rect" x="0" y="0" width="0" height="320"/></clipPath>' +
              '<clipPath id="bgp-silueta"><path d="' + CUERPO + '"/></clipPath>' +
            '</defs>' +
            '<g class="bgp-grilla">' + grilla() + '</g>' +
            '<g clip-path="url(#bgp-revela)"><path class="bgp-area" fill="url(#bgp-area-g)"/><g class="bgp-velas">' + velas() + '</g></g>' +
            '<path class="bgp-ruta"/>' +
            '<path class="bgp-traza-glow" pathLength="1000" filter="url(#bgp-resplandor)"/>' +
            '<path class="bgp-traza" pathLength="1000"/>' +
            '<g class="bgp-auto">' +
              '<ellipse cx="0" cy="2" rx="90" ry="7" fill="#000" opacity=".6" filter="url(#bgp-desenfoque)"/>' +
              '<g transform="scale(1 -1)" mask="url(#bgp-reflejo)" opacity=".55"><use href="#bgp-pickup"/></g>' +
              '<g id="bgp-pickup">' +
                '<g class="bgp-cuerpo">' +
                  '<path d="' + CUERPO + '" fill="url(#bgp-carroceria)" stroke="#2b3342" stroke-width="1"/>' +
                  '<g clip-path="url(#bgp-silueta)">' +
                    '<circle cx="-52" cy="-15" r="18.5" fill="#0c121c"/><circle cx="52" cy="-15" r="18.5" fill="#0c121c"/>' +
                    '<rect class="bgp-destello" x="-150" y="-70" width="36" height="70" fill="url(#bgp-brillo)" transform="skewX(-20)"/>' +
                  '</g>' +
                  '<path d="M -79 -37 L 76 -33" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" fill="none"/>' +
                  '<path d="M -80 -25 L 80 -23" stroke="#3a4352" stroke-opacity=".6" stroke-width="1" fill="none"/>' +
                  '<path d="M -82 -42 L -12 -42" stroke="#5b6676" stroke-width="2"/>' +
                  '<path d="M -30 -42 L -23 -57 L -9 -57" fill="none" stroke="#2a3140" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
                  '<path d="M -1 -45 L 4 -60 Q 5 -62 8 -62 L 18 -62 L 18 -45 Z" fill="url(#bgp-vidrio-auto)"/>' +
                  '<path d="M 21 -45 L 21 -62 L 31 -62 Q 34 -62 37 -59 L 50 -45 Z" fill="url(#bgp-vidrio-auto)"/>' +
                  '<path d="M 19.5 -44 L 19.5 -19 M -3 -44 L -3 -19" stroke="#4a5464" stroke-width="1"/>' +
                  '<rect x="8" y="-40" width="6" height="1.6" rx=".8" fill="#4a5464"/><rect x="30" y="-40" width="6" height="1.6" rx=".8" fill="#4a5464"/>' +
                  '<path d="M 46 -48 l 6 -2 l 1 4 z" fill="#3a4352"/>' +
                  '<rect x="77" y="-33" width="5" height="11" rx="1" fill="#1a2130"/>' +
                  '<path d="M 70 -39 L 81 -37 L 81 -34 L 71 -35 Z" fill="#eaf6ff"/>' +
                  '<rect x="-83.5" y="-41" width="3.5" height="9" rx="1" fill="#e2556b"/>' +
                  '<rect x="-84" y="-17" width="168" height="4" rx="2" fill="#1a2130"/>' +
                '</g>' +
                rueda(-52) + rueda(52) +
              '</g>' +
            '</g>' +
          '</svg>' +
          '<div class="bgp-progreso">' +
            '<div class="bgp-progreso-fila"><span class="bgp-estado" aria-live="polite"></span><span class="bgp-datos"><span class="bgp-seg">0,0 s</span><span class="bgp-pct">0 %</span></span></div>' +
            '<div class="bgp-pista"><div class="bgp-relleno"></div></div>' +
          '</div>' +
        '</section>' +
      '</div>';
  }

  function create(contenedor, op) {
    op = op || {};
    var duracion = op.duracion || 7000;
    var raiz = document.createElement("div");
    raiz.className = "bgp-loader";
    raiz.setAttribute("role", "progressbar");
    raiz.setAttribute("aria-label", "Cargando Tesorería B.G.P Sammar");
    raiz.setAttribute("aria-valuemin", "0");
    raiz.setAttribute("aria-valuemax", "100");
    raiz.innerHTML = plantilla();
    contenedor.appendChild(raiz);

    var q = function (s) { return raiz.querySelector(s); };
    var ruta = rutaTendencia();
    ["bgp-ruta", "bgp-traza", "bgp-traza-glow"].forEach(function (c) { q("." + c).setAttribute("d", ruta); });
    q(".bgp-area").setAttribute("d", ruta + " L " + X1 + " 320 L " + X0 + " 320 Z");

    var auto = q(".bgp-auto"), cuerpo = q(".bgp-cuerpo"), destello = q(".bgp-destello"), revela = q(".bgp-revela-rect");
    var ruedas = raiz.querySelectorAll(".bgp-rueda"), trazas = raiz.querySelectorAll(".bgp-traza, .bgp-traza-glow");
    var relleno = q(".bgp-relleno"), pct = q(".bgp-pct"), seg = q(".bgp-seg"), estadoEl = q(".bgp-estado");
    var pilares = raiz.querySelectorAll(".bgp-pilar");
    var quieto = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var inicio = 0, raf = 0, terminado = false, estadoFijo = null, ultimoEstado = "";
    var x0 = tendX(0.02);

    function cuadro(ahora) {
      if (!inicio) inicio = ahora;
      var ms = ahora - inicio, p = Math.min(1, ms / duracion);
      var t = 0.02 + 0.91 * suave(p);
      var x = tendX(t), y = tendY(t);
      var pend = (tendY(t + 0.001) - tendY(t - 0.001)) / (tendX(t + 0.001) - tendX(t - 0.001));
      var ang = Math.atan(pend);
      auto.setAttribute("transform", "translate(" + x.toFixed(2) + " " + (y - 1.5).toFixed(2) + ") rotate(" + (ang * 180 / Math.PI).toFixed(2) + ") scale(" + ESCALA + ")");
      var giro = ((x - x0) / Math.cos(ang)) / ESCALA / 15 * 180 / Math.PI;
      ruedas.forEach(function (r) { r.setAttribute("transform", "translate(" + r.getAttribute("data-x") + " -15) rotate(" + giro.toFixed(1) + ")"); });
      var bote = quieto || p >= 1 ? 0 : Math.sin(ms / 70) * 0.6;
      cuerpo.setAttribute("transform", "translate(0 " + bote.toFixed(2) + ")");
      if (!quieto) destello.setAttribute("x", (-150 + ((ms / 2600) % 1) * 330).toFixed(1));
      revela.setAttribute("width", (x + 70).toFixed(1));
      var off = (1000 * (1 - fraccionLargo(t))).toFixed(1);
      trazas.forEach(function (tr) { tr.style.strokeDashoffset = off; });

      relleno.style.width = (p * 100).toFixed(2) + "%";
      var n = Math.floor(p * 100);
      pct.textContent = n + " %";
      raiz.setAttribute("aria-valuenow", String(n));
      seg.textContent = (Math.min(ms, duracion) / 1000).toFixed(1).replace(".", ",") + " s";
      pilares.forEach(function (el, k) { if (p >= PILARES[k]) el.classList.add("visible"); });

      var texto = estadoFijo;
      if (!texto) for (var k = 0; k < ESTADOS.length; k++) if (p >= ESTADOS[k][0]) texto = ESTADOS[k][1];
      if (texto !== ultimoEstado) { estadoEl.textContent = texto; ultimoEstado = texto; }

      if (p >= 1 && !terminado) {
        terminado = true;
        raiz.classList.add("completo");
        if (op.alTerminar) op.alTerminar();
      }
      raf = global.requestAnimationFrame(cuadro);
    }

    function iniciar() {
      global.cancelAnimationFrame(raf);
      inicio = 0;
      terminado = false;
      estadoFijo = null;
      ultimoEstado = "";
      raiz.classList.remove("corriendo", "completo");
      pilares.forEach(function (el) { el.classList.remove("visible"); });
      void raiz.offsetWidth;
      raiz.classList.add("corriendo");
      raf = global.requestAnimationFrame(cuadro);
    }

    iniciar();

    return {
      el: raiz,
      reiniciar: iniciar,
      estado: function (texto) { estadoFijo = texto || null; },
      destroy: function () { global.cancelAnimationFrame(raf); if (raiz.parentNode) raiz.parentNode.removeChild(raiz); }
    };
  }

  global.BGPLoader = { create: create };
})(window);
